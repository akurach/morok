'use strict';
'require view';
'require ui';
'require morok.common as fn';

return view.extend({
	rulesOrder: [],

	load: function() {
		return Promise.all([
			L.resolveDefault(fn.call.rules(), { rules: [] }),
			L.resolveDefault(fn.call.sources(), { sources: [] })
		]);
	},

	/* модалка переименования правила */
	showRenameRule: function(r) {
		var input = E('input', { value: r.label || '', style: 'width:100%' });
		var saveBtn = E('button', { 'class': 'fn-btn primary' }, fn._t('Сохранить'));
		saveBtn.addEventListener('click', function() {
			var v = input.value.trim();
			if (!v) { fn.notify(fn._t('Название не может быть пустым')); return; }
			saveBtn.disabled = true;
			saveBtn.textContent = fn._t('Сохраняю…');
			fn.call.renameRule(r.id, v).then(function(res) {
				if (res && res.ok === false) {
					saveBtn.disabled = false;
					saveBtn.textContent = fn._t('Сохранить');
					fn.notify(res.error || fn._t('Не удалось переименовать'));
					return;
				}
				ui.hideModal();
				fn.notify(fn._t('Правило переименовано'));
				setTimeout(function() { location.reload(); }, 700);
			})['catch'](function() {
				saveBtn.disabled = false;
				saveBtn.textContent = fn._t('Сохранить');
				fn.notify(fn._t('Метод rename_rule пока недоступен'));
			});
		});
		ui.showModal(fn._t('Переименовать правило'), [
			E('div', { 'class': 'fn-card-sub', style: 'margin-bottom:10px' },
				fn._t('Меняется только название — условия и действие остаются.')),
			input,
			E('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
				E('button', { 'class': 'fn-btn', click: ui.hideModal }, fn._t('Отмена')),
				saveBtn
			])
		]);
	},

	/* порядок правил: сдвиг + сразу сохраняем через reorder_rules */
	moveRule: function(id, dir) {
		var order = this.rulesOrder.slice();
		var i = order.indexOf(id);
		var j = i + dir;
		if (i < 0 || j < 0 || j >= order.length) return;
		var t = order[i]; order[i] = order[j]; order[j] = t;
		fn.call.reorderRules(order).then(function(res) {
			if (res && res.ok === false) {
				fn.notify(res.error || fn._t('Не удалось изменить порядок'));
				return;
			}
			fn.notify(fn._t('Порядок сохранён — первое совпавшее правило побеждает'));
			setTimeout(function() { location.reload(); }, 600);
		})['catch'](function() {
			fn.notify(fn._t('Метод reorder_rules пока недоступен'));
		});
	},

	ruleRow: function(r, idx, total) {
		var self = this;
		var isFinal = r.match_type === 'final';
		var matchDesc = {
			geosite: 'geosite: ' + (r.match || []).join(', '),
			geosite_geoip: 'geosite/geoip: ' + (r.match || []).join(', '),
			custom: 'custom: ' + (r.match || []).join(', ') + fn._t(' (%s дом.)', (r.match || []).length),
			source_list: fn._t('список: %s', r.source),
			final: fn._t('конечное правило · применяется последним')
		}[r.match_type] || r.match_type;

		var upBtn = E('button', { 'class': 'fn-btn sm', title: fn._t('Выше — сработает раньше'),
			click: function() { self.moveRule(r.id, -1); } }, '↑');
		var downBtn = E('button', { 'class': 'fn-btn sm', title: fn._t('Ниже — сработает позже'),
			click: function() { self.moveRule(r.id, 1); } }, '↓');
		// disabled — свойством: E() кладёт атрибут даже со значением false
		upBtn.disabled = isFinal || idx === 0;
		downBtn.disabled = isFinal || idx === total - 1;

		var row = E('div', { 'class': 'fn-rowitem' + (r.enabled ? '' : ' off'), 'data-action': r.action || '' }, [
			fn.toggle(r.enabled, false, function(on) {
				fn.call.setRule(r.id, on).then(function() {
					row.classList.toggle('off', !on);
					fn.notify(fn._t('Правило «%s»: %s', r.label, on ? fn._t('вкл') : fn._t('выкл')));
				});
			}),
			E('div', { style: 'flex:1;min-width:0' }, [
				E('div', { 'class': 'fn-rowname' }, [
					r.label,
					isFinal ? E('span', { 'class': 'fn-badge' }, 'final') : '',
					r.action === 'antidpi' ? E('span', { 'class': 'fn-badge violet' }, fn._t('адаптивное')) : ''
				]),
				E('div', { 'class': 'fn-rowsub' }, matchDesc)
			]),
			fn.actBadge(r.action),
			E('div', { style: 'display:flex;gap:6px;flex-shrink:0' }, [
				upBtn, downBtn,
				E('button', { 'class': 'fn-btn sm', title: fn._t('Переименовать'),
					click: function() { self.showRenameRule(r); } }, '✎'),
				E('button', { 'class': 'fn-btn sm', title: fn._t('Удалить правило'),
					click: function() {
						if (!confirm(fn._t('Удалить правило «%s»?', r.label))) return;
						fn.call.delRule(r.id).then(function(res) {
							if (res && res.ok === false) { fn.notify(res.error || fn._t('Не удалось удалить')); return; }
							fn.notify(fn._t('Правило удалено'));
							row.remove();
						})['catch'](function() { fn.notify(fn._t('Метод del_rule недоступен')); });
					} }, '🗑')
			])
		]);
		return row;
	},

	/* Wave 2 (2.3): карточка «Проверить домен» — кого куда пустит конфиг */
	renderDomainCheck: function() {
		var input = E('input', { placeholder: fn._t('Домен — например: youtube.com'), style: 'flex:2;min-width:180px' });
		var resBox = E('div');
		var btn = E('button', { 'class': 'fn-btn primary' }, fn._t('Проверить'));

		function showResult(domain, res) {
			resBox.textContent = '';
			if (!res) {
				resBox.appendChild(E('div', { 'class': 'fn-domres' }, [
					E('span', { 'class': 'fn-pill y' }, fn._t('метод check_domain пока недоступен'))
				]));
				return;
			}
			var matches = Array.isArray(res.matches) ? res.matches : [];
			if (matches.length === 0) {
				resBox.appendChild(E('div', { 'class': 'fn-domres' }, [
					E('span', { 'class': 'dname' }, domain),
					E('span', { 'class': 'darrow' }, '→'),
					E('span', { 'class': 'drule' }, fn._t('ни одно правило не совпало')),
					E('span', { 'class': 'darrow' }, '→'),
					fn.actBadge('direct')
				]));
				return;
			}
			// вердикт: движок берёт ПЕРВОЕ совпавшее правило
			var w = matches[0];
			resBox.appendChild(E('div', { 'class': 'fn-domres fn-domres-verdict' }, [
				E('span', { 'class': 'dname' }, domain),
				E('span', { 'class': 'darrow' }, '→'),
				E('span', { 'class': 'drule' }, [ E('b', fn._t('ИТОГ: ')), (w.rule_label || w.rule_id || '?') + (w.source ? ' · ' + w.source : '') ]),
				E('span', { 'class': 'darrow' }, '→'),
				fn.actBadge(w.action)
			]));
			if (matches.length > 1) {
				resBox.appendChild(E('div', { 'class': 'fn-card-sub', style: 'margin:8px 0 2px;opacity:.55' },
					fn._t('матчатся, но НЕ сработают — перекрыты первым правилом:')));
				matches.slice(1).forEach(function(m) {
					resBox.appendChild(E('div', { 'class': 'fn-domres', style: 'opacity:.45' }, [
						E('span', { 'class': 'dname' }, '″'),
						E('span', { 'class': 'darrow' }, '→'),
						E('span', { 'class': 'drule' },
							(m.rule_label || m.rule_id || '?') + (m.source ? ' · ' + m.source : '')),
						E('span', { 'class': 'darrow' }, '→'),
						fn.actBadge(m.action)
					]));
				});
			}
		}

		function run() {
			var d = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
			if (!d) { fn.notify(fn._t('Введи домен')); return; }
			btn.disabled = true;
			btn.textContent = '';
			btn.appendChild(E('span', { 'class': 'fn-spin' }));
			L.resolveDefault(fn.call.checkDomain(d), null).then(function(res) {
				btn.disabled = false;
				btn.textContent = fn._t('Проверить');
				showResult(d, res);
			});
		}
		btn.addEventListener('click', run);
		input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') run(); });

		return E('div', { 'class': 'fn-card', style: 'margin-bottom:16px' }, [
			E('div', { 'class': 'fn-card-title' }, fn._t('Проверить домен')),
			E('div', { 'class': 'fn-card-sub' }, fn._t('какое правило сработает и куда пойдёт трафик')),
			E('div', { 'class': 'fn-add fn-mt' }, [ input, btn ]),
			resBox
		]);
	},

	/* легенда-раскладка: сколько включённых правил куда ведёт; клик — фильтр */
	renderLegend: function(activeRules) {
		var counts = { proxy: 0, direct: 0, block: 0, antidpi: 0 };
		activeRules.forEach(function(r) {
			if (counts[r.action] != null) counts[r.action]++;
		});
		var filterState = { action: null };
		var defs = [
			[ 'proxy', fn._t('→ Прокси') ],
			[ 'antidpi', fn._t('⚡ Оптимизация') ],
			[ 'direct', fn._t('→ Напрямую') ],
			[ 'block', fn._t('✕ Блок') ]
		];
		var chips = defs.map(function(d) {
			var chip = E('span', { 'class': 'fn-act ' + d[0] }, [
				d[1],
				E('span', { 'class': 'cnt' }, String(counts[d[0]]))
			]);
			chip.addEventListener('click', function() {
				filterState.action = (filterState.action === d[0]) ? null : d[0];
				document.querySelectorAll('.fn-legend .fn-act').forEach(function(c2) { c2.classList.remove('on'); });
				if (filterState.action) chip.classList.add('on');
				document.querySelectorAll('.fn-rowitem[data-action]').forEach(function(row) {
					row.style.display = (!filterState.action || row.dataset.action === filterState.action) ? '' : 'none';
				});
			});
			return chip;
		});
		return E('div', { 'class': 'fn-legend' }, chips);
	},

	/* пресеты списков: YouTube/Discord/Meta/TikTok — правило по готовому источнику */
	renderPresets: function(rules, sources) {
		var presets = [
			{ key: 'youtube', label: 'YouTube', action: 'antidpi' },
			{ key: 'discord', label: 'Discord', action: 'proxy' },
			{ key: 'meta',    label: 'Meta',    action: 'proxy' },
			{ key: 'tiktok',  label: 'TikTok',  action: 'proxy' }
		];
		function findSource(key) {
			var found = null;
			(sources || []).forEach(function(s) {
				var hay = ((s.id || '') + ' ' + (s.label || '')).toLowerCase();
				if (!found && hay.indexOf(key) !== -1) found = s;
			});
			return found;
		}
		function hasRule(src) {
			var yes = false;
			(rules || []).forEach(function(r) {
				if (r.source && (r.source === src.id || r.source === src.label)) yes = true;
			});
			return yes;
		}
		var buttons = [];
		presets.forEach(function(p) {
			var src = findSource(p.key);
			// нет реального источника — пресет не показываем вовсе:
			// кнопка-заглушка «нет источника» только путала
			if (!src) return;
			if (hasRule(src)) {
				buttons.push(E('button', { 'class': 'fn-btn sm', disabled: 'disabled' }, fn._t('✓ %s добавлено', p.label)));
				return;
			}
			var b = E('button', { 'class': 'fn-btn sm', title: fn._t('источник: %s', src.label) }, '+ ' + p.label);
			b.addEventListener('click', function() {
				b.disabled = true;
				fn.call.addRule(p.label, src.id, p.action).then(function(res) {
					if (res && res.ok === false) {
						b.disabled = false;
						fn.notify(res.error || fn._t('Не удалось добавить правило'));
						return;
					}
					fn.notify(fn._t('Правило «%s» добавлено — не забудь «Применить» на дашборде', p.label));
					setTimeout(function() { location.reload(); }, 800);
				})['catch'](function() {
					b.disabled = false;
					fn.notify(fn._t('Метод add_rule недоступен'));
				});
			});
			buttons.push(b);
		});
		// ни один пресет не backed реальным источником — карточку не рисуем
		if (buttons.length === 0) return E('div');
		return E('div', { 'class': 'fn-card', style: 'margin-bottom:16px' }, [
			E('div', { 'class': 'fn-card-title' }, fn._t('Быстрые пресеты')),
			E('div', { 'class': 'fn-card-sub' }, fn._t('один клик — готовое правило по подключённому списку')),
			E('div', { 'class': 'fn-presets fn-mt' }, buttons)
		]);
	},

	render: function(data) {
		fn.loadCSS();
		var self = this;
		var rules = (data[0] || {}).rules || [];
		var sources = (data[1] || {}).sources || [];

		var active = rules.filter(function(r) { return r.enabled; });
		var disabled = rules.filter(function(r) { return !r.enabled; });

		var root = E('div');

		// проверка домена (2.3)
		root.appendChild(this.renderDomainCheck());

		// пресеты списков (2.3)
		root.appendChild(this.renderPresets(rules, sources));

		// легенда-раскладка по действиям (2.3)
		root.appendChild(this.renderLegend(active));

		// активные — порядок важен: первое совпавшее правило побеждает
		this.rulesOrder = active.map(function(r) { return r.id; });
		root.appendChild(E('div', { 'class': 'fn-section' }, [
			fn._t('Активные правила'), E('span', { 'class': 'cnt' }, String(active.length))
		]));
		root.appendChild(E('div', { 'class': 'fn-card-sub', style: 'margin:-4px 4px 10px' },
			fn._t('Порядок сверху вниз: первое совпавшее правило побеждает. Стрелки ↑↓ меняют порядок и сохраняют сразу.')));
		var g1 = E('div', { 'class': 'fn-group' });
		active.forEach(function(r, i) { g1.appendChild(self.ruleRow(r, i, active.length)); });
		root.appendChild(g1);

		// отключённые
		if (disabled.length) {
			root.appendChild(E('div', { 'class': 'fn-section' }, [
				fn._t('Отключённые'), E('span', { 'class': 'cnt' }, String(disabled.length))
			]));
			var g2 = E('div', { 'class': 'fn-group' });
			disabled.forEach(function(r) { g2.appendChild(self.ruleRow(r, -1, 0)); });
			root.appendChild(g2);
		}

		// добавить правило
		root.appendChild(E('div', { 'class': 'fn-section' }, fn._t('Добавить своё правило')));
		var input = E('input', { placeholder: fn._t('Домен или IP — например: example.com, 203.0.113.0/24') });
		var select = E('select', [
			E('option', { value: 'proxy' }, fn._t('→ Прокси')),
			E('option', { value: 'direct' }, fn._t('→ Напрямую')),
			E('option', { value: 'antidpi' }, fn._t('⚡ Оптимизация')),
			E('option', { value: 'block' }, fn._t('✕ Блок'))
		]);
		root.appendChild(E('div', { 'class': 'fn-card' }, [
			E('div', { 'class': 'fn-add' }, [
				input, select,
				E('button', { 'class': 'fn-btn primary', click: function() {
					var v = input.value.trim();
					if (!v) { fn.notify(fn._t('Сначала введи домен или IP')); return; }
					fn.call.addRule(v, v, select.value).then(function() {
						fn.notify(fn._t('Правило добавлено — не забудь «Применить» на дашборде'));
						setTimeout(function() { location.reload(); }, 800);
					});
				} }, fn._t('Добавить'))
			]),
			E('div', { 'class': 'fn-card-sub fn-mt' },
				fn._t('Правила применяются сверху вниз — первое совпавшее побеждает. Сложные условия (несколько доменов, regex) — в следующих версиях.'))
		]));

		// источники списков
		root.appendChild(E('div', { 'class': 'fn-section' }, fn._t('Источники списков')));
		var srcCard = E('div', { 'class': 'fn-card' });
		sources.forEach(function(s) {
			var updBtn = E('button', { 'class': 'fn-btn sm' }, fn._t('↻ Обновить сейчас'));
			updBtn.addEventListener('click', function() {
				updBtn.disabled = true;
				updBtn.innerHTML = '';
				updBtn.appendChild(E('span', { 'class': 'fn-spin' }));
				updBtn.appendChild(document.createTextNode(fn._t(' Обновляю…')));
				fn.call.updateSource(s.id).then(function(res) {
					updBtn.disabled = false;
					updBtn.textContent = fn._t('↻ Обновить сейчас');
					if (res && res.ok === false) {
						fn.notify(fn._t('«%s»: %s', s.label, res.error || fn._t('ошибка обновления')));
						return;
					}
					fn.notify(fn._t('«%s»: %s', s.label, fn._t('обновлено') +
						(res && res.count != null ? fn._t(' (%s записей)', res.count) : '')));
				})['catch'](function() {
					updBtn.disabled = false;
					updBtn.textContent = fn._t('↻ Обновить сейчас');
					fn.notify(fn._t('Метод update_source пока недоступен'));
				});
			});
			srcCard.appendChild(E('div', { 'class': 'fn-opt' }, [
				E('span', { 'class': 'fn-dot ' + (s.enabled ? 'g' : 'dim') }),
				E('div', { style: 'flex:1;min-width:0' }, [
					E('div', { 'class': 'fn-opt-name' }, s.label),
					E('div', { 'class': 'fn-rowsub', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, s.url)
				]),
				E('span', { 'class': 'fn-pill dim' }, fn._t('%s ч', Math.round(s.update_interval / 3600))),
				updBtn,
				fn.toggle(s.enabled, false, function(on, input) {
					fn.call.setSource(s.id, on, s.url || '', s.update_interval || 0).then(function(res) {
						if (res && res.ok === false) {
							input.checked = !on;
							fn.notify(res.error || fn._t('Не удалось переключить источник'));
							return;
						}
						fn.notify(fn._t('Источник «%s»: %s', s.label, on ? fn._t('вкл') : fn._t('выкл')));
					})['catch'](function() {
						input.checked = !on;
						fn.notify(fn._t('Метод set_source пока недоступен'));
					});
				})
			]));
		});
		root.appendChild(srcCard);

		return fn.page('routing', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
