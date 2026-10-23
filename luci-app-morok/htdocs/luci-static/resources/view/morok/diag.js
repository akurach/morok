'use strict';
'require view';
'require ui';
'require morok.common as fn';

/* Диагностика (Wave 2, задача 2.2; track B3 — живая):
   список шагов виден сразу (серые «ожидает»), шаги прогоняются по одному
   через diagnose_step {id} → {id,label,status,detail,fix?}, статус меняется
   на глазах (спиннер → ok/warn/fail), у fail — «Исправить» (run_fix +
   перезапуск этого шага). Если diagnose_step недоступен — фоллбэк на
   старый diagnose целиком. */

var DEFAULT_STEPS = [
	{ id: 'service', label: 'Сервис sing-box' },
	{ id: 'config',  label: 'Конфигурация (UCI → sing-box.json)' },
	{ id: 'tunnel',  label: 'Туннель: трафик идёт через ноду' },
	{ id: 'dns',     label: 'DNS: резолв и подмена' },
	{ id: 'dpi',     label: 'Доставка пакетов (правила оптимизации)' }
];

return view.extend({
	steps: null,      // [{id,label,status,detail,fix}]
	running: false,
	useSteps: true,   // false → фоллбэк на старый diagnose целиком

	stepCard: function(s) {
		var self = this;
		var icoCls = { ok: 'ok', warn: 'warn', fail: 'fail', run: 'run' }[s.status] || 'wait';
		var icoTxt = { ok: '✓', warn: '!', fail: '✕' }[s.status] || '…';
		var icoKids = s.status === 'run' ? [ E('span', { 'class': 'fn-spin' }) ] : [ icoTxt ];
		var kids = [
			E('div', { 'class': 'fn-diag-ico ' + icoCls }, icoKids),
			E('div', { style: 'flex:1;min-width:0' }, [
				E('div', { 'class': 'fn-rowname' }, fn._t(s.label || s.id || '?')),
				E('div', { 'class': 'fn-diag-detail' },
					s.detail ? String(s.detail)
						: s.status === 'run' ? fn._t('проверяю…')
						: fn._t('ожидает запуска'))
			])
		];
		if (s.status === 'fail' && s.fix) {
			var fixBtn = E('button', { 'class': 'fn-btn sm', style: 'flex-shrink:0' }, fn._t('🔧 Исправить'));
			fixBtn.addEventListener('click', function() {
				fixBtn.disabled = true;
				fixBtn.textContent = fn._t('Чиню…');
				fn.call.runFix(s.id).then(function(res) {
					if (res && res.ok === false)
						fn.notify(res.error || fn._t('Исправление не удалось'));
					else
						fn.notify(fn._t('Исправление выполнено — перепроверяю шаг…'));
					self.runStep(s.id, true);
				})['catch'](function() {
					fixBtn.disabled = false;
					fixBtn.textContent = fn._t('🔧 Исправить');
					fn.notify(fn._t('Метод run_fix пока недоступен'));
				});
			});
			kids.push(fixBtn);
		}
		return E('div', { 'class': 'fn-diag-step', 'data-step': s.id || '' }, kids);
	},

	replaceStep: function(s) {
		var old = document.querySelector('.fn-diag-step[data-step="' + s.id + '"]');
		if (old) old.replaceWith(this.stepCard(s));
		else this.renderSteps();
	},

	/* один шаг через diagnose_step; standalone=true — перезапуск после fix */
	runStep: function(id, standalone) {
		var self = this;
		var cur = null;
		(this.steps || []).forEach(function(s) { if (s.id === id) cur = s; });
		if (!cur) return Promise.resolve(false);
		cur.status = 'run';
		cur.detail = '';
		this.replaceStep(cur);
		return L.resolveDefault(fn.call.diagnoseStep(id), null).then(function(res) {
			if (res === null) return false; // метод недоступен — сигнал фоллбэка
			cur.label = res.label || cur.label;
			cur.status = res.status || 'warn';
			cur.detail = res.detail || '';
			cur.fix = res.fix;
			self.replaceStep(cur);
			self.updateSummary();
			return true;
		});
	},

	/* прогон всех шагов по одному */
	runAll: function() {
		var self = this;
		var seq = Promise.resolve(true);
		this.steps.forEach(function(s) {
			seq = seq.then(function(ok) {
				if (!ok) return false;
				return self.runStep(s.id, false);
			});
		});
		return seq;
	},

	/* фоллбэк: старый diagnose целиком (backend без diagnose_step) */
	runLegacy: function() {
		var self = this;
		return L.resolveDefault(fn.call.diagnose(), null).then(function(res) {
			if (res === null) {
				self.steps = null;
				self.renderSteps();
				return;
			}
			self.steps = Array.isArray(res.steps) ? res.steps : [];
			self.renderSteps();
		});
	},

	updateSummary: function() {
		var summary = document.getElementById('fn-diag-summary');
		if (!summary || !this.steps) return;
		var fails = 0, warns = 0, done = 0;
		this.steps.forEach(function(s) {
			if (s.status === 'fail') fails++;
			if (s.status === 'warn') warns++;
			if (s.status === 'ok' || s.status === 'warn' || s.status === 'fail') done++;
		});
		summary.textContent = '';
		if (done < this.steps.length)
			summary.appendChild(E('span', { 'class': 'fn-pill b' }, fn._t('проверено %s из %s', done, this.steps.length)));
		else
			summary.appendChild(E('span', { 'class': 'fn-pill ' + (fails ? 'r' : warns ? 'y' : 'g') },
				fails ? fn._t('проблем: %s', fails) : warns ? fn._t('замечаний: %s', warns) : fn._t('всё в порядке')));
	},

	renderSteps: function() {
		var box = document.getElementById('fn-diag-steps');
		if (!box) return;
		box.textContent = '';
		var self = this;
		if (!this.steps || this.steps.length === 0) {
			box.appendChild(fn.unavailCard(fn._t('Диагностика')));
			return;
		}
		this.steps.forEach(function(s) { box.appendChild(self.stepCard(s)); });
		this.updateSummary();
	},

	render: function() {
		fn.loadCSS();
		var self = this;

		// шаги видны сразу — серые «ожидает»
		this.steps = DEFAULT_STEPS.map(function(s) {
			return { id: s.id, label: s.label, status: 'wait', detail: '' };
		});

		var runBtn = E('button', { 'class': 'fn-btn primary' }, fn._t('▶ Запустить проверку'));
		runBtn.addEventListener('click', function() {
			if (self.running) return;
			self.running = true;
			runBtn.disabled = true;
			runBtn.textContent = '';
			runBtn.appendChild(E('span', { 'class': 'fn-spin' }));
			runBtn.appendChild(document.createTextNode(fn._t(' Проверяю…')));

			// сброс шагов в «ожидает»
			self.steps.forEach(function(s) { s.status = 'wait'; s.detail = ''; s.fix = null; });
			self.renderSteps();

			var done = function() {
				self.running = false;
				runBtn.disabled = false;
				runBtn.textContent = fn._t('↻ Проверить ещё раз');
			};

			if (self.useSteps) {
				self.runAll().then(function(ok) {
					if (ok === false) {
						// diagnose_step недоступен — фоллбэк на старый diagnose
						self.useSteps = false;
						return self.runLegacy();
					}
				}).then(done);
			} else {
				self.runLegacy().then(done);
			}
		});

		var stepEls = this.steps.map(function(s) { return self.stepCard(s); });
		var root = E('div', [
			E('div', { 'class': 'fn-card' }, [
				E('div', { 'class': 'fn-spread' }, [
					E('div', [
						E('div', { 'class': 'fn-card-title' }, fn._t('Диагностика')),
						E('div', { 'class': 'fn-card-sub' }, fn._t('поэтапная проверка: сервис → конфиг → туннель → DNS → доставка пакетов'))
					]),
					runBtn
				])
			]),
			E('div', { 'class': 'fn-card fn-mt', style: 'padding:6px 0' }, [
				E('div', { style: 'padding:12px 18px 10px;display:flex;align-items:center;gap:10px' }, [
					E('span', { 'class': 'fn-card-title' }, fn._t('Шаги проверки')),
					E('span', { id: 'fn-diag-summary' })
				]),
				E('div', { id: 'fn-diag-steps' }, stepEls)
			])
		]);

		return fn.page('diag', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
