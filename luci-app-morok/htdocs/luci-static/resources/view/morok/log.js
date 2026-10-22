'use strict';
'require view';
'require ui';
'require poll';
'require morok.common as fn';

/* Журнал (Wave 1, задача 1.6): /tmp/log/morok.log через ubus read_log.
   Автообновление каждые 5 с (с паузой), подсветка WARN/ERROR/FATAL,
   фильтр по тексту. Сверху — статус guardian (guardian_status), если метод есть. */

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fn.call.readLog(300), null),
			L.resolveDefault(fn.call.guardianStatus(), null)
		]);
	},

	logLines: [],     // последний срез строк
	filter: '',
	paused: false,

	/* «N мин назад» для unix-timestamp */
	agoText: function(ts) {
		var sec = Math.max(0, Math.floor(Date.now() / 1000) - ts);
		if (sec < 60) return 'только что';
		var min = Math.floor(sec / 60);
		if (min < 60) return min + ' мин назад';
		var h = Math.floor(min / 60);
		if (h < 24) return h + ' ч ' + (min % 60) + ' мин назад';
		return new Date(ts * 1000).toLocaleString();
	},

	/* режим adaptive-правила человеческим текстом */
	guardianModeText: function(st) {
		var map = {
			watch:   [ 'следим', 'dim', 'dim' ],
			probe:   [ 'следим', 'dim', 'dim' ],
			ok:      [ 'следим', 'dim', 'dim' ],
			antidpi: [ 'оптимизация', 'violet', 'g' ],
			proxy:   [ 'через VPN', 'hl', 'y' ]
		};
		return map[st] || [ st || '—', '', st ? 'y' : 'dim' ];
	},

	/* guardian_status (track B3): { running, engine, antidpi_running,
	   rules[].state_text, last_probe? } — рисуем что пришло */
	renderGuardian: function(gs) {
		if (gs === null)
			return null; // метода нет — карточку не показываем вовсе
		var self = this;
		// running приходит явным полем; старый backend — через status
		var running = gs.running === true || gs.running === 1 || gs.status === 'running';
		var stopped = gs.running === false || gs.running === 0 || gs.status === 'stopped';
		var antidpi = gs.antidpi_running === true || gs.antidpi_running === 1;
		var kids = [
			E('div', { 'class': 'fn-card-title' }, [
				'Сторож (guardian) ',
				E('span', { 'class': 'fn-badge violet' }, 'оптимизация')
			])
		];
		var pills = [];
		pills.push(E('span', { 'class': 'fn-pill ' + (running ? 'g' : stopped ? 'r' : 'dim') },
			running ? 'работает' : stopped ? 'остановлен' : (gs.status || 'статус неизвестен')));
		if (gs.engine)
			pills.push(E('span', { 'class': 'fn-pill b' }, 'движок: ' + gs.engine));
		if (gs.antidpi_running != null)
			pills.push(E('span', { 'class': 'fn-pill ' + (antidpi ? 'g' : 'dim') },
				'оптимизация: ' + (antidpi ? 'активна' : 'не запущена')));
		if (gs.mode)
			pills.push(E('span', { 'class': 'fn-pill b' }, 'режим: ' + gs.mode));
		if (gs.last_probe)
			pills.push(E('span', { 'class': 'fn-pill dim' }, 'проверка: ' + self.agoText(gs.last_probe)));
		kids.push(E('div', { 'class': 'fn-hero-meta', style: 'margin-top:10px' }, pills));
		// правила под наблюдением, если бэк их прислал
		var rules = gs.rules || gs.adaptive || [];
		if (rules.length) {
			var g = E('div', { style: 'margin-top:12px' });
			rules.forEach(function(r) {
				// новый контракт — готовый state_text; старый — state/mode через карту
				var mt = r.state_text
					? [ r.state_text, r.state === 'proxy' ? 'hl' : r.state === 'antidpi' ? 'violet' : '',
						r.state === 'proxy' ? 'y' : r.state === 'antidpi' ? 'g' : 'dim' ]
					: self.guardianModeText(r.state || r.mode || '');
				g.appendChild(E('div', { 'class': 'fn-rowitem', style: 'padding:8px 0' }, [
					E('span', { 'class': 'fn-dot ' + mt[2] }),
					E('div', { style: 'flex:1;min-width:0' }, [
						E('div', { 'class': 'fn-rowname' }, r.label || r.id || '?'),
						r.detail ? E('div', { 'class': 'fn-rowsub' }, r.detail) : '',
						r.last_probe ? E('div', { 'class': 'fn-rowsub' },
							'последняя проверка: ' + self.agoText(r.last_probe)) : ''
					]),
					E('span', { 'class': 'fn-badge' + (mt[1] ? ' ' + mt[1] : '') }, mt[0])
				]));
			});
			kids.push(g);
		} else if (gs.note) {
			kids.push(E('div', { 'class': 'fn-card-sub fn-mt' }, String(gs.note)));
		}
		return E('div', { 'class': 'fn-card', style: 'margin-bottom:16px' }, kids);
	},

	lineClass: function(line) {
		if (/\b(FATAL|ERROR)\b/i.test(line)) return 'err';
		if (/\bWARN/i.test(line)) return 'warn';
		return '';
	},

	renderLog: function(box) {
		var self = this;
		box.textContent = '';
		var q = this.filter.trim().toLowerCase();
		var shown = 0;
		this.logLines.forEach(function(line) {
			if (q && line.toLowerCase().indexOf(q) === -1) return;
			shown++;
			box.appendChild(E('div', { 'class': 'fn-log-line ' + self.lineClass(line) }, line));
		});
		if (shown === 0)
			box.appendChild(E('div', { 'class': 'fn-log-line' },
				this.logLines.length ? 'Ничего не совпало с фильтром' : 'Лог пуст'));
		// прилипаем к низу, если пользователь не отскроллил вверх
		if (box.dataset.stick !== '0')
			box.scrollTop = box.scrollHeight;
	},

	render: function(data) {
		fn.loadCSS();
		var self = this;
		var logRes = data[0];
		var gs = data[1];

		var root = E('div');

		var gcard = this.renderGuardian(gs);
		if (gcard) root.appendChild(gcard);

		if (logRes === null) {
			root.appendChild(fn.unavailCard('Журнал'));
			return fn.page('log', root);
		}

		// бэк может отдать { log: "..." } или { lines: [...] }
		if (typeof logRes.log === 'string')
			this.logLines = logRes.log.split('\n').filter(function(l) { return l !== ''; });
		else if (Array.isArray(logRes.lines))
			this.logLines = logRes.lines.map(String);

		var box = E('div', { 'class': 'fn-logbox' });
		box.addEventListener('scroll', function() {
			// отскроллил вверх — не дёргаем; вернулся вниз — снова прилипаем
			box.dataset.stick = (box.scrollHeight - box.scrollTop - box.clientHeight < 30) ? '1' : '0';
		});

		var filterInput = E('input', { placeholder: 'Фильтр по тексту…' });
		filterInput.addEventListener('input', function() {
			self.filter = filterInput.value;
			self.renderLog(box);
		});

		var pauseBtn = E('button', { 'class': 'fn-btn' }, '⏸ Пауза');
		pauseBtn.addEventListener('click', function() {
			self.paused = !self.paused;
			pauseBtn.textContent = self.paused ? '▶ Продолжить' : '⏸ Пауза';
			if (self.paused) poll.stop(); else poll.start();
		});

		var statusPill = E('span', { 'class': 'fn-pill g' }, 'обновление каждые 5 с');

		root.appendChild(E('div', { 'class': 'fn-card' }, [
			E('div', { 'class': 'fn-toolbar', style: 'margin-bottom:12px' }, [
				E('div', { 'class': 'fn-search' }, filterInput),
				pauseBtn,
				statusPill
			]),
			box
		]));

		this.renderLog(box);

		poll.add(L.bind(function() {
			if (self.paused) return Promise.resolve();
			return L.resolveDefault(fn.call.readLog(300), null).then(function(res) {
				if (res === null) {
					statusPill.className = 'fn-pill y';
					statusPill.textContent = 'метод read_log недоступен';
					return;
				}
				if (typeof res.log === 'string')
					self.logLines = res.log.split('\n').filter(function(l) { return l !== ''; });
				else if (Array.isArray(res.lines))
					self.logLines = res.lines.map(String);
				self.renderLog(box);
			});
		}, this), 5);

		return fn.page('log', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
