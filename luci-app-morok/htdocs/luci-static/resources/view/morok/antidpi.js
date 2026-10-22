'use strict';
'require view';
'require ui';
'require morok.common as fn';

/* Оптимизация доставки: ручной выбор профиля обработки пакетов nfqws2,
   статус движка и проверка домена вживую — не дожидаясь guardian.
   Контракт: get_antidpi / set_antidpi / test_antidpi (backend трек C). */

return view.extend({
	load: function() {
		return L.resolveDefault(fn.call.getAntidpi(), null);
	},

	/* локальное состояние страницы */
	sel: 'youtube',
	custom: '',
	data: null,

	strategyLabel: function(id) {
		var list = (this.data && this.data.strategies) || [];
		for (var i = 0; i < list.length; i++)
			if (list[i].id === id) return list[i].label;
		return id;
	},

	/* ---- сканер профилей доставки ---- */
	scan: null,
	scanTimer: null,
	scanApplying: '',

	pollScan: function() {
		var self = this;
		if (self.scanTimer) return;
		self.scanTimer = setInterval(function() {
			if (!self.scanBox || !document.contains(self.scanBox)) {
				clearInterval(self.scanTimer); self.scanTimer = null; return;
			}
			fn.call.scanStatus().then(function(st) {
				if (!st) return;
				var wasRunning = self.scan && self.scan.running === true;
				self.scan = st;
				self.renderScanBody();
				if (wasRunning && st.running !== true) {
					clearInterval(self.scanTimer); self.scanTimer = null;
					/* прогон кончился — движок перезапущен с исходной
					   стратегией, освежаем статус-карточку */
					fn.call.getAntidpi().then(function(nd) {
						if (nd) { self.data = nd; self.refresh(); }
					});
				}
			});
		}, 3000);
	},

	renderScanBody: function() {
		if (!this.scanBox) return;
		this.scanBox.textContent = '';
		this.scanBox.appendChild(this.buildScanCard());
	},

	scanDomainPill: function(dr) {
		if (!dr) return E('span', { 'class': 'fn-pill dim' }, '—');
		if (dr.code && dr.code !== '000')
			return E('span', { 'class': 'fn-pill g' },
				'✓ ' + dr.code + (dr.ms ? ' · ' + dr.ms + ' мс' : ''));
		return E('span', { 'class': 'fn-pill r' }, '✗' + (dr.ms ? ' · ' + dr.ms + ' мс' : ''));
	},

	buildScanCard: function() {
		var self = this;
		var st = this.scan || {};
		var running = st.running === true;
		var results = st.results || [];
		var domains = (st.domains && st.domains.length) ? st.domains : [ 'youtube.com', 'googlevideo.com' ];
		var total = st.total || 0;

		var startBtn = E('button', { 'class': 'fn-btn primary' }, '🔍 Диагностика доставки');
		startBtn.disabled = running || self.scanApplying !== '';
		startBtn.addEventListener('click', function() {
			startBtn.disabled = true;
			startBtn.textContent = 'Запускаю…';
			fn.call.scanStart().then(function(res) {
				if (!res || res.ok === false) {
					fn.notify('✗ ' + ((res && res.error) || 'scan_start недоступен'));
					startBtn.disabled = false;
					startBtn.textContent = '🔍 Диагностика доставки';
					return;
				}
				self.scan = { running: true, done: 0, total: res.total || 0,
					results: [], domains: res.domains || [] };
				self.renderScanBody();
				self.pollScan();
			})['catch'](function() {
				fn.notify('метод scan_start недоступен');
				startBtn.disabled = false;
				startBtn.textContent = '🔍 Диагностика доставки';
			});
		});

		var stopBtn = E('button', { 'class': 'fn-btn sm' }, '⏹ Остановить');
		stopBtn.addEventListener('click', function() {
			stopBtn.disabled = true;
			stopBtn.textContent = 'Останавливаю…';
			fn.call.scanStop().then(function(res) {
				if (res && res.ok === false)
					fn.notify('✗ ' + (res.error || 'не остановлено'));
				else
					fn.notify('Сканирование остановлено, стратегия восстановлена');
				fn.call.scanStatus().then(function(st2) {
					if (st2) { self.scan = st2; self.renderScanBody(); }
					if (self.scanTimer) { clearInterval(self.scanTimer); self.scanTimer = null; }
					fn.call.getAntidpi().then(function(nd) {
						if (nd) { self.data = nd; self.refresh(); }
					});
				});
			})['catch'](function() { fn.notify('метод scan_stop недоступен'); });
		});

		var progressText = '';
		if (running) {
			var cur = st.current_label || st.current || '';
			progressText = '⏳ профиль ' + Math.min((st.done || 0) + 1, total || 1) + '/' + total +
				(cur ? ': ' + cur + '…' : '…');
		} else if ((st.done || 0) > 0) {
			progressText = (st.stopped === true ? '⏹ остановлено: ' : '✓ готово: ') +
				st.done + '/' + total + ' профилей проверено';
		}

		/* таблица результатов (строчная, флексами — E() в GL-сборке
		   не разворачивает вложенные массивы, дети только плоские) */
		var headCells = [ E('div', { style: 'flex:1.4;min-width:0;font-weight:700;color:var(--fn-muted2)' }, 'Профиль') ];
		domains.forEach(function(d) {
			headCells.push(E('div', { style: 'flex:1;min-width:0;font-weight:700;color:var(--fn-muted2)' }, d));
		});
		headCells.push(E('div', { style: 'width:96px' }, ''));

		var table = E('div', { style: 'margin-top:11px;font-size:12.5px' },
			E('div', { style: 'display:flex;gap:8px;padding:6px 10px;border-bottom:1px solid var(--fn-border2)' }, headCells));

		results.forEach(function(r) {
			var okAny = false;
			var cells = [ E('div', { style: 'flex:1.4;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
				title: r.id }, r.label || r.id) ];
			domains.forEach(function(d) {
				var dr = r.domain_results ? r.domain_results[d] : null;
				if (dr && dr.code && dr.code !== '000') okAny = true;
				cells.push(E('div', { style: 'flex:1;min-width:0' }, self.scanDomainPill(dr)));
			});
			var btnCell = E('div', { style: 'width:96px;text-align:right' }, '');
			if (okAny) {
				var applyBtn = E('button', { 'class': 'fn-btn sm' }, 'Применить');
				applyBtn.disabled = running || self.scanApplying !== '';
				applyBtn.addEventListener('click', function() {
					self.scanApplying = r.id;
					applyBtn.disabled = true;
					applyBtn.textContent = 'Применяю…';
					fn.call.scanApply(r.id).then(function(res) {
						self.scanApplying = '';
						if (!res || res.ok === false) {
							fn.notify('✗ ' + ((res && res.error) || 'scan_apply недоступен'));
						} else {
							fn.notify('✓ Профиль «' + (res.label || r.label || r.id) + '» применён' +
								(res.running ? '' : ' — но движок не поднялся, см. журнал'));
						}
						self.renderScanBody();
						fn.call.getAntidpi().then(function(nd) {
							if (nd) { self.data = nd; self.refresh(); }
						});
					})['catch'](function() {
						self.scanApplying = '';
						fn.notify('метод scan_apply недоступен');
						self.renderScanBody();
					});
				});
				btnCell.textContent = '';
				btnCell.appendChild(applyBtn);
			}
			cells.push(btnCell);
			table.appendChild(E('div', { style: 'display:flex;gap:8px;padding:7px 10px;border-bottom:1px solid var(--fn-border);align-items:center' }, cells));
		});

		if (st.error)
			table.appendChild(E('div', { 'class': 'fn-card-sub', style: 'margin-top:8px;color:var(--fn-yellow)' }, '⚠ ' + st.error));

		var ctrlKids = [ startBtn ];
		if (running) ctrlKids.push(stopBtn);

		var bodyKids = [
			E('div', { 'class': 'fn-card-title' }, 'Диагностика доставки'),
			E('div', { 'class': 'fn-card-sub' },
				'Прогон батареи профилей zapret2 против ' + domains.join(' и ') +
				': какие обеспечивают доставку — тот и выбирайте. По окончании возвращается прежняя стратегия.'),
			E('div', { style: 'display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap' }, ctrlKids)
		];
		if (progressText)
			bodyKids.push(E('div', { 'class': 'fn-card-sub', style: 'margin-top:9px' }, progressText));
		if (results.length) bodyKids.push(table);
		else if (running)
			bodyKids.push(E('div', { 'class': 'fn-card-sub', style: 'margin-top:9px' },
				'первые результаты появятся через несколько секунд…'));
		bodyKids.push(E('div', { 'class': 'fn-card-sub', style: 'margin-top:10px;opacity:.75' },
			'⚠ во время проверки движок оптимизации кратковременно перезапускается; трафик правил в режиме «через VPN» не затрагивается.'));

		return E('div', { 'class': 'fn-card' }, bodyKids);
	},

	/* ---- карточка статуса ---- */
	renderStatus: function() {
		var d = this.data;
		var engineName = d.engine === 'zapret2' ? 'nfqws2 (zapret2)' : d.engine;
		var engPill;
		if (d.engine === 'none')
			engPill = E('span', { 'class': 'fn-pill dim' }, 'выключен');
		else if (d.running)
			engPill = E('span', { 'class': 'fn-pill g' }, 'работает');
		else
			engPill = E('span', { 'class': 'fn-pill r' }, 'остановлен');

		var g = d.guardian || { mode: 'off', state_text: '' };
		var gCls = g.mode === 'proxy' ? 'y' : g.mode === 'mixed' ? 'y' : g.mode === 'off' ? 'dim' : 'g';
		var gText = { off: 'сторож: правил нет', proxy: 'сторож: увёл в VPN', mixed: 'сторож: часть правил в VPN', antidpi: 'сторож: оптимизация активна' }[g.mode] || g.mode;

		return E('div', { 'class': 'fn-card' }, [
			E('div', { 'class': 'fn-spread' }, [
				E('div', [
					E('div', { 'class': 'fn-card-title' }, 'Статус движка'),
					E('div', { 'class': 'fn-card-sub' }, 'оптимизация доставки пакетов на лету, без VPN')
				]),
				engPill
			]),
			E('div', { style: 'margin-top:12px' }, [
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, 'Движок'),
						E('div', { 'class': 'fn-opt-desc' }, engineName)
					]),
					E('span', { 'class': 'fn-dot ' + (d.running ? 'g' : d.engine === 'none' ? 'dim' : 'r') })
				]),
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, 'Активная стратегия'),
						E('div', { 'class': 'fn-opt-desc' }, 'профиль аргументов nfqws2')
					]),
					E('span', { 'class': 'fn-badge violet' }, this.strategyLabel(d.strategy))
				]),
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, 'Guardian по правилам'),
						E('div', { 'class': 'fn-opt-desc' }, g.state_text || '—')
					]),
					E('span', { 'class': 'fn-pill ' + gCls }, gText)
				]),
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, 'Доменов в хостлисте'),
						E('div', { 'class': 'fn-opt-desc' },
							(d.rules_count || 0) + ' вкл. правил «Оптимизация» + сиды профиля')
					]),
					E('span', { 'class': 'fn-pill b' }, String((d.hostlist || []).length))
				])
			])
		]);
	},

	/* ---- выбор стратегии ---- */
	renderStrategies: function() {
		var self = this;
		var d = this.data;
		var box = E('div', { 'class': 'fn-strats' });

		(d.strategies || []).forEach(function(st) {
			var radio = E('span', { 'class': 'fn-radio' + (self.sel === st.id ? ' sel' : '') });
			var kids = [
				radio,
				E('div', { style: 'flex:1;min-width:0' }, [
					E('div', { 'class': 'fn-strat-name' }, [
						st.label,
						d.strategy === st.id ? E('span', { 'class': 'fn-badge hl' }, 'активна') : ''
					]),
					E('div', { 'class': 'fn-strat-desc' }, st.desc)
				])
			];
			var card = E('div', {
				'class': 'fn-strat' + (self.sel === st.id ? ' on' : ''),
				click: function() {
					self.sel = st.id;
					self.refresh();
				}
			}, kids);

			if (st.id === 'custom') {
				var ta = E('textarea', {
					placeholder: '--filter-tcp=443 --hostlist=... --lua-desync=multisplit:pos=1,midsld --new ...',
					spellcheck: 'false'
				}, self.custom);
				ta.addEventListener('input', function() { self.custom = ta.value; });
				ta.addEventListener('click', function(ev) { ev.stopPropagation(); });
				card.lastChild.appendChild(ta);
			}
			box.appendChild(card);
		});

		var applyBtn = E('button', { 'class': 'fn-btn primary' }, 'Применить стратегию');
		var applyNote = E('div', { 'class': 'fn-card-sub', style: 'margin-top:9px' });
		applyBtn.addEventListener('click', function() {
			applyBtn.disabled = true;
			applyBtn.textContent = 'Проверяю и применяю…';
			applyNote.textContent = '';
			fn.call.setAntidpi(self.sel, '', self.sel === 'custom' ? self.custom : null)
				.then(function(res) {
					applyBtn.disabled = false;
					applyBtn.textContent = 'Применить стратегию';
					if (!res || res.ok === false) {
						applyNote.textContent = '✗ ' + ((res && res.error) || 'не удалось применить');
						applyNote.style.color = 'var(--fn-red)';
						return;
					}
					applyNote.style.color = '';
					applyNote.textContent = '✓ ' + (res.note || 'применено');
					/* освежаем статус: движок/стратегия/хостлист перечитались */
					fn.call.getAntidpi().then(function(nd) {
						if (nd) { self.data = nd; self.refresh(); }
					});
				})['catch'](function() {
					applyBtn.disabled = false;
					applyBtn.textContent = 'Применить стратегию';
					applyNote.textContent = '✗ метод set_antidpi недоступен';
					applyNote.style.color = 'var(--fn-red)';
				});
		});

		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-title' }, 'Профиль оптимизации'),
			E('div', { 'class': 'fn-card-sub' },
				'Перед применением nfqws2 прогоняет самопроверку (--dry-run): битый профиль не роняет работающий движок — останется прежний.'),
			box,
			E('div', { style: 'margin-top:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
				applyBtn
			]),
			applyNote
		]);
	},

	/* ---- проверка домена ---- */
	renderTest: function() {
		var self = this;
		var input = E('input', {
			placeholder: 'youtube.com',
			style: 'min-width:220px;flex:1'
		});
		var resultBox = E('div');
		var btn = E('button', { 'class': 'fn-btn' }, '🔬 Проверить');
		btn.addEventListener('click', function() {
			var dom = String(input.value || '').trim().toLowerCase();
			if (!dom) { fn.notify('Введите домен'); return; }
			btn.disabled = true;
			btn.textContent = 'Проверяю…';
			resultBox.textContent = '';
			fn.call.testAntidpi(dom).then(function(res) {
				btn.disabled = false;
				btn.textContent = '🔬 Проверить';
				if (!res) {
					fn.notify('метод test_antidpi недоступен');
					return;
				}
				var ok = res.ok !== false && res.code && res.code !== '000';
				var cls = ok ? 'ok' : 'bad';
				var title = ok
					? '✓ Доставка есть! Оптимизация работает'
					: '✗ Доставки нет — попробуй другой профиль';
				if (res.ok === false && !res.code) title = '✗ Проверка не удалась';
				var metaParts = [];
				if (res.ip) metaParts.push('IP ' + res.ip);
				if (res.code) metaParts.push('HTTP ' + res.code);
				if (res.time_ms != null && res.code && res.code !== '000') metaParts.push(res.time_ms + ' мс');
				resultBox.appendChild(E('div', { 'class': 'fn-verdict ' + cls }, [
					E('div', { style: 'font-size:17px;line-height:1' }, ok ? '⚡' : '🛡'),
					E('div', [
						E('div', { 'class': 'fn-verdict-title' }, title),
						E('div', { 'class': 'fn-verdict-note' }, res.note || res.error || ''),
						metaParts.length ? E('div', { 'class': 'fn-verdict-meta' }, metaParts.join(' · ')) : ''
					])
				]));
			})['catch'](function() {
				btn.disabled = false;
				btn.textContent = '🔬 Проверить';
				fn.notify('метод test_antidpi недоступен');
			});
		});
		input.addEventListener('keydown', function(ev) {
			if (ev.key === 'Enter') btn.click();
		});

		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-title' }, 'Проверка доставки'),
			E('div', { 'class': 'fn-card-sub' },
				'IP резолвится через DoH по туннелю (системный DNS может быть недостоверен), затем TLS идёт НАПРЯМУЮ — через nfqws2, если движок жив.'),
			E('div', { style: 'display:flex;gap:10px;margin-top:12px;flex-wrap:wrap' }, [
				input, btn
			]),
			resultBox
		]);
	},

	/* ---- хостлист ---- */
	renderHostlist: function() {
		var hl = (this.data && this.data.hostlist) || [];
		var tags = E('div', { 'class': 'fn-hostlist-tags' });
		hl.forEach(function(d) {
			tags.appendChild(E('span', { 'class': 'fn-badge' }, d));
		});
		if (!hl.length)
			tags.appendChild(E('div', { 'class': 'fn-card-sub' }, 'пусто — движок работает без hostlist-фильтра или не запущен'));

		var det = E('details', { 'class': 'fn-hostlist', style: 'margin-top:12px' }, [
			E('summary', {}, 'Домены в хостлисте (' + hl.length + ')'),
			tags
		]);

		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-title' }, 'Хостлист оптимизации'),
			E('div', { 'class': 'fn-card-sub' },
				'Собирается автоматически из включённых правил с действием «Оптимизация» (custom-домены) плюс сиды профиля. ' +
				'Только чтение — меняется через правила, а не руками.'),
			det
		]);
	},

	refresh: function() {
		var root = E('div');
		this.scanBox = E('div');
		this.scanBox.appendChild(this.buildScanCard());
		root.appendChild(this.scanBox);
		root.appendChild(this.renderStatus());
		root.appendChild(this.renderStrategies());
		root.appendChild(this.renderTest());
		root.appendChild(this.renderHostlist());
		root.appendChild(E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-sub' }, [
				'💡 Правила с действием «Оптимизация» настраиваются на странице ',
				E('a', { href: L.url('admin/services/morok/routing') }, 'Маршрутизация'),
				' — там же включается адаптивный сторож (guardian) для каждого правила.'
			])
		]));
		this.mainBox.textContent = '';
		this.mainBox.appendChild(root);
	},

	render: function(data) {
		fn.loadCSS();
		this.data = data;
		if (!data) {
			return fn.page('antidpi', E('div', [
				fn.unavailCard('Оптимизация (get_antidpi)')
			]));
		}
		this.sel = data.strategy || 'youtube';
		this.custom = data.strategy_custom || '';
		this.mainBox = E('div');
		this.refresh();
		/* если прогон уже идёт (запущен раньше) — подхватываем опрос */
		var self = this;
		L.resolveDefault(fn.call.scanStatus(), null).then(function(st) {
			if (!st) return;
			self.scan = st;
			self.renderScanBody();
			if (st.running === true) self.pollScan();
		});
		return fn.page('antidpi', this.mainBox);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
