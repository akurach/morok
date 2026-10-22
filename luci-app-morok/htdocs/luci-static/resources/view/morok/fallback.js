'use strict';
'require view';
'require ui';
'require morok.common as fn';

/* Фоллбэк: редактор цепочки (Wave 1, задача 1.2) + настройки проверки + kill switch.
   set_chain { chain } — контракт §6, реализует backend (трек C). */

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fn.call.chain(), { fallback: {}, nodes: [] }),
			L.resolveDefault(fn.call.nodes(), null)
		]);
	},

	/* локальное состояние редактора (заполняется в render) */
	chain: [],
	nodes: {},
	dirty: false,

	renderChainEditor: function(container) {
		var self = this;
		container.textContent = '';

		/* ---- текущая цепочка (редактируемая, горизонтально) ---- */
		var chainBox = E('div', { 'class': 'fn-chain-big' });
		this.chain.forEach(function(id, i) {
			var n = self.nodes[id];
			if (i > 0) chainBox.appendChild(E('div', { 'class': 'fn-chain-link' }, '→'));
			var cname = n ? fn.labelParts(n.label) : [ id ];
			chainBox.appendChild(E('div', { 'class': 'fn-chain-card' + (i === 0 ? ' primary' : '') }, [
				E('div', { 'class': 'fn-spread' }, [
					E('div', { 'class': 'role' }, i === 0 ? 'Основная' : 'Резерв ' + i),
					E('div', { 'class': 'fn-chain-ctl' }, [
						self.ctlBtn('←', 'Раньше в цепочке', i === 0, function() { self.moveChain(i, -1, container); }),
						self.ctlBtn('→', 'Позже в цепочке', i === self.chain.length - 1, function() { self.moveChain(i, 1, container); }),
						self.ctlBtn('✕', 'Убрать из цепочки', false, function() {
							self.chain.splice(i, 1);
							self.markDirty();
							self.renderChainEditor(container);
						})
					])
				]),
				E('div', { 'class': 'cname' }, cname),
				E('div', { 'class': 'cmeta' }, [
					n ? fn.metricCell(n) : '',
					E('div', n
						? n.type + ' · ' + n.server + (n.enabled ? '' : ' · выключена — urltest её пропустит')
						: 'нода не найдена — убери её из цепочки')
				])
			]));
		});
		if (this.chain.length === 0)
			chainBox.appendChild(E('div', { 'class': 'fn-card-sub', style: 'padding:14px 4px' },
				'Цепочка пуста — добавь ноды из пула ниже. Первая в цепочке становится основной.'));
		container.appendChild(chainBox);

		/* ---- панель действий ---- */
		var saveBtn = E('button', { 'class': 'fn-btn primary' }, 'Сохранить цепочку');
		saveBtn.disabled = !this.dirty;
		saveBtn.addEventListener('click', function() {
			saveBtn.disabled = true;
			saveBtn.textContent = 'Сохраняю…';
			fn.call.setChain(self.chain.slice()).then(function(res) {
				if (res && res.ok === false) {
					saveBtn.disabled = false;
					saveBtn.textContent = 'Сохранить цепочку';
					fn.notify(res.error || 'Не удалось сохранить цепочку');
					return;
				}
				fn.notify('Цепочка сохранена — применяется…');
				setTimeout(function() { location.reload(); }, 1200);
			})['catch'](function() {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Сохранить цепочку';
				fn.notify('Метод set_chain пока недоступен');
			});
		});

		var autoBtn = E('button', { 'class': 'fn-btn' }, '⚡ Подобрать 3 быстрейшие');
		autoBtn.addEventListener('click', function() {
			autoBtn.disabled = true;
			autoBtn.textContent = 'Проверяем ноды…';
			fn.call.testNodes().then(function(res) {
				autoBtn.disabled = false;
				autoBtn.textContent = '⚡ Подобрать 3 быстрейшие';
				if (!res || res.ok === false) {
					fn.notify((res && res.error) || 'sing-box не запущен — проверка невозможна');
					return;
				}
				// новый контракт: results:[{id,tcp_ms,url_ms,dns_ok}]; старый: delays{id:ms}
				var speed = {};
				if (Array.isArray(res.results)) {
					res.results.forEach(function(r) {
						var v = (r.url_ms != null && r.url_ms > 0) ? r.url_ms
							: (r.tcp_ms != null && r.tcp_ms > 0) ? r.tcp_ms : null;
						if (v != null) speed[r.id] = v;
					});
				} else if (res.delays) {
					Object.keys(res.delays).forEach(function(id) {
						if (res.delays[id] > 0) speed[id] = res.delays[id];
					});
				}
				// выключенные ноды в «3 быстрейшие» не берём
				var best = Object.keys(self.nodes).filter(function(id) {
					return self.nodes[id].enabled && speed[id] != null;
				}).sort(function(a, b) { return speed[a] - speed[b]; }).slice(0, 3);
				if (best.length === 0) {
					fn.notify('Ни одна включённая нода не ответила — цепочка не изменена');
					return;
				}
				self.chain = best;
				self.markDirty();
				self.renderChainEditor(container);
				fn.notify('Подобрано ' + best.length + ' — нажми «Сохранить цепочку»');
			})['catch'](function() {
				autoBtn.disabled = false;
				autoBtn.textContent = '⚡ Подобрать 3 быстрейшие';
				fn.notify('Проверка нод недоступна');
			});
		});

		container.appendChild(E('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:4px' }, [
			saveBtn, autoBtn
		]));

		/* ---- пул нод вне цепочки: выключенные не предлагаем ---- */
		var pool = Object.keys(this.nodes).map(function(id) { return self.nodes[id]; })
			.filter(function(n) { return n.enabled && self.chain.indexOf(n.id) === -1; });
		if (pool.length) {
			container.appendChild(E('div', { 'class': 'fn-section' }, 'Пул нод — добавить в цепочку'));
			var g = E('div', { 'class': 'fn-group' });
			pool.forEach(function(n) {
				g.appendChild(E('div', { 'class': 'fn-rowitem' }, [
					E('span', { 'class': 'fn-dot g' }),
					E('div', { style: 'flex:1;min-width:0' }, [
						E('div', { 'class': 'fn-rowname' }, fn.labelParts(n.label)),
						E('div', { 'class': 'fn-rowsub' }, n.type + ' · ' + n.server + ':' + n.port)
					]),
					fn.metricCell(n),
					E('button', {
						'class': 'fn-btn sm',
						click: function() {
							self.chain.push(n.id);
							self.markDirty();
							self.renderChainEditor(container);
						}
					}, '+ в цепочку')
				]));
			});
			container.appendChild(g);
			container.appendChild(E('div', { 'class': 'fn-card-sub', style: 'margin-top:8px' },
				'Выключенные ноды здесь не показываются и в цепочку не попадают — включить можно на странице «Пул нод».'));
		}
	},

	moveChain: function(i, dir, container) {
		var j = i + dir;
		if (j < 0 || j >= this.chain.length) return;
		var t = this.chain[i];
		this.chain[i] = this.chain[j];
		this.chain[j] = t;
		this.markDirty();
		this.renderChainEditor(container);
	},

	/* disabled выставляем свойством, не атрибутом: E() кладёт атрибут даже
	   со значением false, а HTML disabled — presence-based */
	ctlBtn: function(text, title, disabled, onClick) {
		var b = E('button', { 'class': 'fn-btn sm', title: title, click: onClick }, text);
		b.disabled = !!disabled;
		return b;
	},

	markDirty: function() {
		this.dirty = true;
	},

	render: function(data) {
		fn.loadCSS();
		var self = this;
		var fb = (data[0] || {}).fallback || {};
		// метрики — из общего с пулом источника (nodes), чтобы значения
		// совпадали со страницей «Пул нод»; если nodes недоступен — из chain
		var nodeList = (data[1] && Array.isArray(data[1].nodes)) ? data[1].nodes
			: ((data[0] || {}).nodes || []);
		this.nodes = {};
		nodeList.forEach(function(n) { self.nodes[n.id] = n; });
		this.chain = (fb.chain || []).slice();
		this.dirty = false;

		var root = E('div');

		/* ---- карточка цепочки (редактор) ---- */
		var editorBox = E('div');
		var card = E('div', { 'class': 'fn-card' }, [
			E('div', { 'class': 'fn-spread' }, [
				E('div', [
					E('div', { 'class': 'fn-card-title' }, 'Цепочка фоллбэка'),
					E('div', { 'class': 'fn-card-sub' }, 'если основная нода умирает — трафик уходит на следующую живую (urltest)')
				])
			]),
			editorBox
		]);
		this.renderChainEditor(editorBox);
		root.appendChild(card);

		/* ---- настройки проверки ---- */
		var urlInput = E('input', { value: fb.test_url || '', style: 'min-width:260px' });
		urlInput.addEventListener('change', function() {
			fn.call.setFallback(0, '', fb.auto_return, urlInput.value)
				.then(function() { fn.notify('URL проверки сохранён'); });
		});

		var thrSeg = E('div', { 'class': 'fn-seg' });
		[ 1, 3, 5 ].forEach(function(n) {
			thrSeg.appendChild(E('button', {
				'class': fb.fail_threshold === n ? 'on' : '',
				click: function() {
					thrSeg.querySelectorAll('button').forEach(function(b) { b.classList.remove('on'); });
					this.classList.add('on');
					fn.call.setFallback(n, '', fb.auto_return, '')
						.then(function() { fn.notify('Порог переключения: ' + n); });
				}
			}, String(n)));
		});

		card.appendChild(E('div', [
			E('div', { 'class': 'fn-opt' }, [
				E('div', [
					E('div', { 'class': 'fn-opt-name' }, 'Метод проверки живости'),
					E('div', { 'class': 'fn-opt-desc' }, 'URL-test: реальный запрос через ноду, а не просто ping')
				]),
				urlInput
			]),
			E('div', { 'class': 'fn-opt' }, [
				E('div', [
					E('div', { 'class': 'fn-opt-name' }, 'Переключаться после'),
					E('div', { 'class': 'fn-opt-desc' }, 'подряд неудачных проверок')
				]),
				thrSeg
			]),
			E('div', { 'class': 'fn-opt' }, [
				E('div', [
					E('div', { 'class': 'fn-opt-name' }, 'Возвращаться к основной автоматически'),
					E('div', { 'class': 'fn-opt-desc' }, 'с задержкой ' + (fb.return_delay || 60) + ' с против флаппинга')
				]),
				fn.toggle(fb.auto_return, false, function(on) {
					fn.call.setFallback(0, '', on, '')
						.then(function() { fn.notify('Автовозврат: ' + (on ? 'вкл' : 'выкл')); });
				})
			])
		]));

		/* ---- kill switch ---- */
		var ksSeg = E('div', { 'class': 'fn-seg blocky' });
		[
			[ 'kill', '🔒 Перекрыть интернет' ],
			[ 'direct', '⚠️ Пустить напрямую' ],
			[ 'nothing', '🤷 Ничего' ]
		].forEach(function(pair) {
			ksSeg.appendChild(E('button', {
				'class': (fb.kill_switch === pair[0] ? 'on' : '') + (fb.kill_switch === pair[0] && pair[0] === 'kill' ? ' danger-on' : ''),
				click: function() {
					ksSeg.querySelectorAll('button').forEach(function(b) { b.classList.remove('on', 'danger-on'); });
					this.classList.add('on');
					if (pair[0] === 'kill') this.classList.add('danger-on');
					fn.call.setFallback(0, pair[0], fb.auto_return, '').then(function() {
						fn.notify(pair[0] === 'kill'
							? 'Kill Switch: при обрыве интернет будет перекрыт'
							: pair[0] === 'direct'
								? 'Внимание: при обрыве трафик пойдёт через провайдера'
								: 'При обрыве ничего не произойдёт');
					});
				}
			}, pair[1]));
		});

		root.appendChild(E('div', { 'class': 'fn-ks fn-mt' }, [
			E('div', { 'class': 'fn-spread' }, [
				E('div', { 'class': 'fn-ks-title' }, '⚠ Kill Switch')
			]),
			E('div', { 'class': 'fn-card-sub', style: 'margin-top:8px' },
				'Что делать, если умерли все ноды в цепочке:'),
			E('div', { class: 'fn-mt' }, ksSeg),
			E('div', { 'class': 'fn-card-sub fn-mt' },
				'«Перекрыть интернет» — ни один пакет не уйдёт мимо туннеля: провайдер не увидит, куда ты ходишь, даже пока VPN лежит.')
		]));

		/* ---- сторож правил оптимизации ---- */
		root.appendChild(E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-title' }, [
				'Адаптивные правила оптимизации ',
				E('span', { 'class': 'fn-badge violet' }, 'guardian')
			]),
			E('div', { 'class': 'fn-card-sub' },
				'Сторож проверяет правила «Оптимизация»: если доставка через движок деградирует — правило временно уходит в прокси, ' +
				'после rescan пытается вернуться. Живой статус — на вкладке «Журнал».')
		]));

		return fn.page('fallback', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
