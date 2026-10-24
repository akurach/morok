'use strict';
'require view';
'require poll';
'require ui';
'require morok.common as fn';

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fn.call.status(), {}),
			L.resolveDefault(fn.call.chain(), {}),
			L.resolveDefault(fn.call.nodes(), {}),
			L.resolveDefault(fn.call.rules(), {}),
			L.resolveDefault(fn.call.metricsRead(), null)
		]);
	},

	/* Точечное обновление текстовых значений — только если изменились
	   (без мерцания при поллинге каждые 10 с). */
	setStat: function(id, txt) {
		var el = document.getElementById(id);
		if (el && el.textContent !== txt) {
			el.textContent = txt;
			el.classList.remove('fn-flash');
			void el.offsetWidth; // перезапуск анимации
			el.classList.add('fn-flash');
		}
	},

	pickMs: function(n) {
		if (!n) return null;
		if (n.url_ms != null && n.url_ms > 0) return n.url_ms;
		if (n.tcp_ms != null && n.tcp_ms > 0) return n.tcp_ms;
		if (n.ping != null && n.ping > 0) return n.ping;
		return null;
	},

	/* живые карточки: туннель, активная нода (+ping, позиция в цепочке),
	   счётчики нод/правил, последнее обновление подписок */
	refreshStats: function(st, nodesData, rulesData, chainData) {
		st = st || {};
		var nodes = (nodesData && Array.isArray(nodesData.nodes)) ? nodesData.nodes : [];
		var subs = (nodesData && Array.isArray(nodesData.subscriptions)) ? nodesData.subscriptions : [];
		var rules = (rulesData && Array.isArray(rulesData.rules)) ? rulesData.rules : [];
		var chain = (chainData && chainData.fallback && Array.isArray(chainData.fallback.chain))
			? chainData.fallback.chain : (st.chain || []);

		// туннель
		this.setStat('fn-st-running', st.running ? fn._t('Работает') : (st.all_dead ? fn._t('Все ноды упали') : fn._t('Стоп')));
		this.setStat('fn-st-mode', fn._t('режим: %s',
			({ smart: fn._t('умный'), global: fn._t('глобальный'), off: fn._t('выключен') }[st.mode] || st.mode || '—')) +
			fn._t(' · ядро: %s', st.engine || 'sing-box'));

		// активная нода: имя, ping, позиция в цепочке
		var byId = {};
		nodes.forEach(function(n) { byId[n.id] = n; });
		var active = byId[st.active_node];
		var label = st.active_label || (active && active.label) || st.active_node || '—';
		var nameEl = document.getElementById('fn-st-node');
		if (nameEl && nameEl.dataset.label !== label) {
			nameEl.dataset.label = label;
			nameEl.textContent = '';
			var parts = fn.labelParts(label);
			parts.forEach(function(p) { nameEl.appendChild(typeof p === 'string' ? document.createTextNode(p) : p); });
		}
		var ping = this.pickMs(active) || (st.active_ping > 0 ? st.active_ping : null);
		var pos = chain.indexOf(st.active_node);
		var pingTxt = (st.engine === 'xray')
			? fn._t('пинг недоступен под xray')
			: (ping != null ? fn._t('%s мс', ping) : fn._t('не измерено')) +
				(chain.length ? (pos >= 0 ? fn._t(' · в цепочке %s/%s', pos + 1, chain.length) : fn._t(' · вне цепочки')) : '');
		this.setStat('fn-st-ping', pingTxt);

		// ноды: живо X из Y — но только среди ИЗМЕРЕННЫХ; если замеров ещё
		// не было (пустой кэш после рестарта/переустановки), честно пишем
		// «не проверялись», а не пугаем «0 из 33»
		var enabled = nodes.filter(function(n) { return n.enabled; });
		var measured = enabled.filter(function(n) {
			return n.tcp_ms != null || n.url_ms != null || (n.ping != null && n.ping > 0);
		});
		var alive = measured.filter(function(n) { return this.pickMs(n) != null; }, this);
		this.setStat('fn-st-nodes', measured.length === 0
			? fn._t('не проверялись')
			: fn._t('%s из %s', alive.length, measured.length));

		// правила: N в VPN / M оптимизация / K напрямую (только включённые)
		var cnt = { proxy: 0, antidpi: 0, direct: 0 };
		rules.forEach(function(r) {
			if (!r.enabled) return;
			if (r.action === 'proxy') cnt.proxy++;
			else if (r.action === 'antidpi') cnt.antidpi++;
			else if (r.action === 'direct') cnt.direct++;
		});
		this.setStat('fn-st-rules', cnt.proxy + ' / ' + cnt.antidpi + ' / ' + cnt.direct);

		// подписки: последнее обновление
		var lastUpd = 0;
		subs.forEach(function(s) { if (s.last_update > lastUpd) lastUpd = s.last_update; });
		this.setStat('fn-st-subs', subs.length === 0 ? fn._t('нет подписок') : fn.agoText(lastUpd));
	},

	renderHero: function(st) {
		var self = this;
		var dead = st.all_dead || !st.running;
		var engine = st.engine || 'sing-box';
		// детей собираем ПЛОСКО: GL-сборка E() вложенные массивы не разворачивает
		var nameChildren = fn.labelParts(st.active_label || st.active_node || '—');
		if (st.active_broken)
			nameChildren.push(E('span', { 'class': 'fn-pill r' }, fn._t('нода недоступна — выбери другую')));
		else
			nameChildren.push(E('span', { 'class': 'fn-badge' }, engine));
		var hero = E('div', { 'class': 'fn-hero' }, [
			E('div', { 'class': 'fn-hero-status' + (dead ? ' dead' : '') }, [
				E('span', { 'class': 'fn-dot ' + (dead ? 'r' : 'g') }),
				E('span', dead
					? (st.all_dead ? fn._t('Все ноды недоступны') : fn._t('Сервис остановлен'))
					: fn._t('Подключено · режим %s', { smart: fn._t('Умный'), global: fn._t('Глобальный'), off: fn._t('Выключен') }[st.mode] || st.mode))
			]),
			E('div', { 'class': 'fn-hero-name' }, nameChildren),
			E('div', { 'class': 'fn-hero-meta' }, [
				engine === 'xray'
					? E('span', { 'class': 'fn-pill dim', title: fn._t('У xray нет Clash API — задержки нод не измеряются') },
						fn._t('пинг недоступен под xray'))
					: fn.pingPill(st.running ? st.active_ping : null),
				E('span', { 'class': 'fn-pill dim' }, fn._t('цепочка: %s ноды', (st.chain || []).length)),
				E('span', { 'class': 'fn-pill ' + (st.kill_switch === 'kill' ? 'r' : 'dim') },
					st.kill_switch === 'kill' ? fn._t('Kill Switch активен') : 'Kill Switch: ' + st.kill_switch)
			]),
			E('div', { 'class': 'fn-hero-actions' }, [
				E('a', { 'class': 'fn-btn primary', href: L.url('admin/services/morok/nodes') }, fn._t('Сменить ноду')),
				E('a', { 'class': 'fn-btn', href: L.url('admin/services/morok/fallback') }, fn._t('Настроить фоллбэк')),
				E('button', { 'class': 'fn-btn', title: fn._t('Мастер первого запуска'),
					click: function() { self.showWizard(st); } }, fn._t('🪄 Мастер'))
			])
		]);
		return hero;
	},

	renderKillBanner: function(st) {
		if (!(st.all_dead && st.kill_switch === 'kill')) return E('div');
		return E('div', { 'class': 'fn-kill' }, [
			E('div', { 'class': 'kb-ico' }, '⛔'),
			E('div', { style: 'flex:1' }, [
				E('b', fn._t('Интернет отключён Kill Switch\'ом')),
				E('p', { 'class': 'fn-muted' }, fn._t('Все ноды недоступны — трафик перекрыт, чтобы ничего не утекло мимо туннеля.'))
			])
		]);
	},

	renderChainStrip: function(data) {
		var fb = data.fallback || {};
		var nodes = {};
		(data.nodes || []).forEach(function(n) { nodes[n.id] = n; });
		var strip = E('div', { 'class': 'fn-chain' });
		(fb.chain || []).forEach(function(id, i) {
			var n = nodes[id];
			if (i > 0) strip.appendChild(E('span', { 'class': 'fn-chain-arrow' }, '→'));
			var nc = n ? fn.labelParts(n.label) : [ id ];
			var ms = n ? ((n.url_ms > 0 && n.url_ms) || (n.tcp_ms > 0 && n.tcp_ms) || n.ping) : null;
			nc.push(E('small', (i === 0 ? fn._t('основная') : fn._t('резерв %s', i)) + (ms ? ' · ' + ms + ' ms' : '')));
			strip.appendChild(E('div', { 'class': 'fn-chain-node' }, [
				E('span', { 'class': 'fn-dot ' + (n && n.enabled ? 'g' : 'dim') }),
				E('div', nc)
			]));
		});
		return strip;
	},

	renderQuickToggles: function(st) {
		var self = this;
		function opt(name, desc, checked, danger, field, values) {
			return E('div', { 'class': 'fn-opt' }, [
				E('div', [
					E('div', { 'class': 'fn-opt-name' }, name),
					E('div', { 'class': 'fn-opt-desc' }, desc)
				]),
				fn.toggle(checked, danger, function(on) {
					fn.call.setGlobal(field, values ? values[on ? 1 : 0] : (on ? '1' : '0'))
						.then(function() { fn.notify(fn._t('%s: %s', name, fn._t(on ? 'вкл' : 'выкл'))); });
				})
			]);
		}

		/* Wave 3 (трек C): ядро туннеля — sing-box | xray.
		   set_global engine + apply: полный рестарт, ~7 с даунтайма. */
		var engine = st.engine || 'sing-box';
		var engineSel = E('select', { style: 'min-width:150px' }, [
			E('option', { value: 'sing-box' }, 'sing-box'),
			E('option', { value: 'xray' }, 'xray (xhttp)')
		]);
		engineSel.value = engine;
		engineSel.addEventListener('change', function() {
			var v = engineSel.value;
			if (v === engine) return;
			if (!confirm(fn._t('Смена ядра на «%s» перезапустит туннель — интернет пропадёт примерно на 7 секунд.\n\n%sПродолжить?',
				v,
				v === 'xray'
					? fn._t('Под xray нужны ноды с поддержкой xhttp; пинги нод и «Проверить все» работать не будут.\n\n')
					: ''))) {
				engineSel.value = engine;
				return;
			}
			engineSel.disabled = true;
			fn.call.setGlobal('engine', v).then(function(res) {
				if (res && res.ok === false) {
					engineSel.disabled = false;
					engineSel.value = engine;
					fn.notify(res.error || fn._t('Ядро не переключено'));
					return;
				}
				fn.notify(fn._t('Ядро: %s — применяю и перезапускаю…', v));
				return L.resolveDefault(fn.call.apply(), null).then(function() {
					setTimeout(function() { location.reload(); }, 6000);
				});
			})['catch'](function() {
				engineSel.disabled = false;
				engineSel.value = engine;
				fn.notify(fn._t('Метод set_global(engine) недоступен — обнови backend'));
			});
		});
		var engineOpt = E('div', { 'class': 'fn-opt' }, [
			E('div', [
				E('div', { 'class': 'fn-opt-name' }, fn._t('Ядро туннеля')),
				E('div', { 'class': 'fn-opt-desc' },
					fn._t('sing-box — стандарт; xray — для нод с транспортом xhttp (без пингов нод)'))
			]),
			engineSel
		]);

		return E('div', { 'class': 'fn-card' }, [
			E('div', { 'class': 'fn-card-title' }, fn._t('Быстрые переключатели')),
			opt(fn._t('Прокси'), fn._t('весь сервис целиком'), st.enabled, false, 'enabled'),
			E('div', { 'class': 'fn-opt' }, [
				E('div', [
					E('div', { 'class': 'fn-opt-name' }, 'Kill Switch'),
					E('div', { 'class': 'fn-opt-desc' }, fn._t('перекрыть интернет при падении всех нод'))
				]),
				fn.toggle(st.kill_switch === 'kill', true, function(on) {
					fn.call.setFallback(0, on ? 'kill' : 'direct', st.auto_return, '')
						.then(function() {
							fn.notify(on
								? fn._t('Kill Switch: при обрыве интернет будет перекрыт')
								: fn._t('Внимание: при обрыве трафик пойдёт через провайдера'));
						});
				})
			]),
			opt(fn._t('Прозрачный прокси'), fn._t('туннель для всех устройств LAN'), st.transparent, false, 'transparent'),
			opt(fn._t('Оптимизация'), fn._t('обработка пакетов для правил с действием «Оптимизация»'), st.antidpi, false, 'antidpi'),
			engineOpt
		]);
	},

	/* ---------- Wave 3.5: метрики ---------- */

	/* каркас секции: график rate + суммарный трафик + топ правил/нод */
	renderMetricsCard: function() {
		var self = this;
		var resetBtn = E('button', { 'class': 'fn-btn', title: fn._t('Обнулить накопленную историю метрик'),
			click: function() {
				if (!confirm(fn._t('Сбросить накопленные метрики (история графика, топ правил и нод)?'))) return;
				resetBtn.disabled = true;
				fn.call.metricsReset().then(function(res) {
					resetBtn.disabled = false;
					if (res && res.ok) fn.notify(fn._t('Метрики сброшены — сбор начался заново'));
					else fn.notify((res && res.error) || fn._t('Сброс не удался'));
				})['catch'](function() {
					resetBtn.disabled = false;
					fn.notify(fn._t('Метод morok_metrics.reset недоступен'));
				});
			} }, fn._t('⟲ Сбросить'));

		return E('div', { 'class': 'fn-card fn-mt', id: 'fn-mx-card' }, [
			E('div', { 'class': 'fn-spread' }, [
				E('div', [
					E('div', { 'class': 'fn-card-title' }, fn._t('📊 Метрики')),
					E('div', { 'class': 'fn-card-sub', id: 'fn-mx-sub' }, fn._t('трафик через туннель · сбор раз в минуту, храним сутки'))
				]),
				resetBtn
			]),
			E('div', { 'class': 'fn-mx-chartwrap' }, [
				E('canvas', { id: 'fn-mx-chart' })
			]),
			E('div', { 'class': 'fn-mx-totals' }, [
				E('div', { 'class': 'fn-mx-total' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('Скачано через туннель')),
					E('div', { 'class': 'fn-mx-num', id: 'fn-mx-dn' }, '—')
				]),
				E('div', { 'class': 'fn-mx-total' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('Отправлено')),
					E('div', { 'class': 'fn-mx-num', id: 'fn-mx-up' }, '—')
				]),
				E('div', { 'class': 'fn-mx-total' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('DNS-хиджак')),
					E('div', { 'class': 'fn-mx-num', id: 'fn-mx-dns' }, '—')
				]),
				E('div', { 'class': 'fn-mx-total' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('Аптайм sing-box')),
					E('div', { 'class': 'fn-mx-num', id: 'fn-mx-uptime' }, '—')
				])
			]),
			E('div', { 'class': 'fn-mx-cols' }, [
				E('div', [
					E('div', { 'class': 'fn-mx-coltitle' }, fn._t('Топ правил по трафику')),
					E('div', { id: 'fn-mx-rules' }, E('div', { 'class': 'fn-card-sub' }, fn._t('пока нет данных')))
				]),
				E('div', [
					E('div', { 'class': 'fn-mx-coltitle' }, fn._t('Топ нод по трафику')),
					E('div', { id: 'fn-mx-nodes' }, E('div', { 'class': 'fn-card-sub' }, fn._t('пока нет данных')))
				])
			])
		]);
	},

	/* "rule_set=src-refilter => route(proxy)" / "rule_set=[a b] => route(direct)" / "final" → маппинг на UCI-правило */
	prettyRule: function(key, rules) {
		var name = String(key), action = '';
		var m = name.match(/^rule_set=(.+?)\s*=>\s*\w+\((\w+)\)$/);
		if (m) { name = m[1]; action = m[2]; }
		// список сетов "[geosite-category-ru geoip-ru]" → проверяем каждый
		var names = name.replace(/^\[|\]$/g, '').split(/\s+/).filter(function(s) { return s !== ''; });
		var label = null;
		(rules || []).forEach(function(r) {
			if (label) return;
			for (var i = 0; i < names.length; i++) {
				var nm = names[i];
				var hit = (nm === 'set-' + r.id) ||
					(nm === 'src-' + (r.source || '')) ||
					(nm === 'final' && r.match_type === 'final') ||
					((nm.indexOf('geosite-') === 0 || nm.indexOf('geoip-') === 0) &&
						Array.isArray(r.match) && r.match.indexOf(nm.replace(/^geo(site|ip)-/, '')) >= 0);
				if (hit) { label = r.label; break; }
			}
		});
		if (!label) label = name === 'final' ? fn._t('Всё остальное (final)') : name;
		return { label: label, action: action };
	},

	mxRow: function(name, sub, bytes, maxBytes, badge) {
		var pct = maxBytes > 0 ? Math.max(2, Math.round(bytes / maxBytes * 100)) : 2;
		var nameKids = fn.labelParts(name);
		return E('div', { 'class': 'fn-mx-row' }, [
			E('div', { 'class': 'fn-mx-rowhead' }, [
				E('span', { 'class': 'fn-mx-name' }, nameKids),
				badge || '',
				E('span', { 'class': 'fn-mx-val' }, fn.fmtBytes(bytes))
			]),
			E('div', { 'class': 'fn-mx-bar' }, [ E('i', { style: 'width:' + pct + '%' }) ]),
			sub ? E('div', { 'class': 'fn-mx-sub2' }, sub) : ''
		]);
	},

	/* обновление секции по данным morok_metrics.read */
	updateMetrics: function(m, rulesData, nodesData) {
		var self = this;
		var card = document.getElementById('fn-mx-card');
		if (!card) return;
		if (!m) {
			this.setStat('fn-mx-sub', fn._t('метрики недоступны — обнови backend (rpcd-плагин morok_metrics)'));
			return;
		}
		if (m.empty) {
			this.setStat('fn-mx-sub', m.note || fn._t('сборщик запущен, данные появятся через минуту'));
			return;
		}
		var samples = Array.isArray(m.samples) ? m.samples : [];
		this.setStat('fn-mx-sub',
			fn._t('трафик через туннель · семплов: %s · %s · с %s',
				samples.length,
				m.clash ? fn._t('per-node из Clash API') : fn._t('Clash API недоступен — только nft-счётчики'),
				new Date((m.started || 0) * 1000).toLocaleString()));

		// график: rate Б/с по tcp+udp tproxy-счётчикам, последние 60 семплов
		var rates = [];
		for (var i = 1; i < samples.length; i++) {
			var dt = samples[i].t - samples[i - 1].t;
			if (dt <= 0) continue;
			var db = (samples[i].tcp + samples[i].udp) - (samples[i - 1].tcp + samples[i - 1].udp);
			rates.push(db > 0 ? Math.round(db / dt) : 0);
		}
		rates = rates.slice(-60);
		var cv = document.getElementById('fn-mx-chart');
		if (cv) fn.drawArea(cv, rates, {});

		// суммарно (кумулятивные счётчики clash + nft dns)
		var last = samples.length ? samples[samples.length - 1] : {};
		this.setStat('fn-mx-dn', fn.fmtBytes(last.dn));
		this.setStat('fn-mx-up', fn.fmtBytes(last.up));
		this.setStat('fn-mx-dns', fn.fmtBytes(last.dns));
		this.setStat('fn-mx-uptime', fn.fmtUptime(m.singbox_uptime));

		// топ правил
		var rules = (rulesData && Array.isArray(rulesData.rules)) ? rulesData.rules : [];
		var rEl = document.getElementById('fn-mx-rules');
		if (rEl) {
			var rArr = [];
			Object.keys(m.rules || {}).forEach(function(k) {
				if (m.rules[k] > 0) rArr.push([ k, m.rules[k] ]);
			});
			rArr.sort(function(a, b) { return b[1] - a[1]; });
			rEl.textContent = '';
			if (rArr.length === 0) {
				rEl.appendChild(E('div', { 'class': 'fn-card-sub' }, fn._t('пока нет данных')));
			} else {
				rArr.slice(0, 5).forEach(function(kv) {
					var pr = self.prettyRule(kv[0], rules);
					var kids = self.mxRow(pr.label, null, kv[1], rArr[0][1],
						pr.action ? E('span', { 'class': 'fn-badge' }, pr.action) : null);
					rEl.appendChild(kids);
				});
			}
		}

		// топ нод + доступность
		var nodes = (nodesData && Array.isArray(nodesData.nodes)) ? nodesData.nodes : [];
		var byId = {};
		nodes.forEach(function(n) { byId[n.id] = n; });
		var nEl = document.getElementById('fn-mx-nodes');
		if (nEl) {
			var nArr = [];
			Object.keys(m.nodes || {}).forEach(function(k) {
				var v = m.nodes[k];
				var tot = (v.up || 0) + (v.dn || 0);
				if (tot > 0) nArr.push([ k, tot, v ]);
			});
			nArr.sort(function(a, b) { return b[1] - a[1]; });
			nEl.textContent = '';
			if (nArr.length === 0) {
				nEl.appendChild(E('div', { 'class': 'fn-card-sub' }, fn._t('пока нет данных')));
			} else {
				nArr.slice(0, 5).forEach(function(kv) {
					var node = byId[kv[0]];
					var name = (node && node.label) || kv[0];
					var v = kv[2];
					var sub = (v.seen > 0)
						? fn._t('доступность: %s%% (%s/%s проверок)', Math.round(v.ok / v.seen * 100), v.ok, v.seen)
						: null;
					nEl.appendChild(self.mxRow(name, sub, kv[1], nArr[0][1], null));
				});
			}
		}
	},


	showWizard: function(st) {
		st = st || {};
		var wiz = {
			step: 0,
			mode: st.mode === 'global' ? 'global' : 'smart',
			ks: st.kill_switch === 'kill' ? 'kill' : (st.kill_switch === 'nothing' ? 'nothing' : 'direct'),
			autoReturn: st.auto_return
		};
		var dots = E('div', { 'class': 'fn-wiz-steps' });
		var body = E('div');
		var overlay = E('div', { 'class': 'fn-wiz-overlay' }, [
			E('div', { 'class': 'fn-wiz' }, [ dots, body ])
		]);
		var NSTEPS = 5;

		function finish() {
			fn.call.setGlobal('wizard_done', '1').then(function() {
				return L.resolveDefault(fn.call.apply(), null);
			}).then(function() {
				fn.notify(fn._t('Мастер завершён — применяю конфигурацию…'));
				setTimeout(function() { location.reload(); }, 2500);
			})['catch'](function() {
				overlay.remove();
				fn.notify(fn._t('Метод set_global недоступен — мастер просто закрыт'));
			});
		}

		function drawDots() {
			dots.textContent = '';
			for (var i = 0; i < NSTEPS; i++)
				dots.appendChild(E('i', { 'class': i <= wiz.step ? 'done' : '' }));
		}

		function btn(label, cls, onClick) {
			return E('button', { 'class': 'fn-btn' + (cls ? ' ' + cls : ''), click: onClick }, label);
		}

		function skipBtn() {
			var b = btn(fn._t('Пропустить'), 'fn-wiz-skip', finish);
			b.style.opacity = '.65';
			return b;
		}

		function shell(title, sub, bodyKids, actionKids) {
			var kids = [ E('div', { 'class': 'fn-wiz-title' }, title) ];
			if (sub) kids.push(E('div', { 'class': 'fn-wiz-sub' }, sub));
			kids.push(E('div', { 'class': 'fn-wiz-body' }, bodyKids));
			kids.push(E('div', { 'class': 'fn-wiz-actions' }, actionKids));
			return kids;
		}

		function choice(name, desc, sel, onSel) {
			var el = E('div', { 'class': 'fn-choice' + (sel ? ' sel' : '') }, [
				E('span', { 'class': 'fn-radio' + (sel ? ' sel' : ''), style: 'margin-top:2px' }),
				E('div', [
					E('div', { 'class': 'cname' }, name),
					E('div', { 'class': 'cdesc' }, desc)
				])
			]);
			el.addEventListener('click', onSel);
			return el;
		}

		function renderStep() {
			drawDots();
			body.textContent = '';
			var kids;
			if (wiz.step === 0) {
				kids = shell(fn._t('Наведём порядок в трафике 🌫'),
					fn._t('Пара шагов — и роутер сам разрулит, что пустить через туннель, что напрямую, а что — на оптимизацию доставки. Займёт минуту.'),
					[],
					[ skipBtn(), btn(fn._t('Начать →'), 'primary', function() { wiz.step = 1; renderStep(); }) ]);
			} else if (wiz.step === 1) {
				var nameI = E('input', { placeholder: fn._t('Название подписки — например: HLVPN'), style: 'width:100%' });
				var url1 = E('input', { placeholder: fn._t('Основная ссылка на подписку'), style: 'width:100%' });
				var url2 = E('input', { placeholder: fn._t('Резервная ссылка (необязательно)'), style: 'width:100%' });
				var uaSel = E('select', { style: 'width:100%' }, [
					E('option', { value: 'sing-box' }, fn._t('User-Agent: sing-box (стандарт)')),
					E('option', { value: 'v2rayN/9.99' }, fn._t('User-Agent: v2rayN/9.99 (панели типа Happ)')),
					E('option', { value: 'v2rayNG/1.8.29' }, 'User-Agent: v2rayNG'),
					E('option', { value: 'Happ/1.0' }, 'User-Agent: Happ'),
					E('option', { value: 'clash-verge/v2.0.3' }, 'User-Agent: Clash Verge')
				]);
				var hwidChk = E('input', { type: 'checkbox' });
				var added = E('div', { style: 'display:none' });
				var addSubBtn = btn(fn._t('＋ Добавить подписку'), '', function() {
					var urls = [ url1.value.trim(), url2.value.trim() ].filter(function(u) { return u !== ''; });
					if (!nameI.value.trim() || urls.length === 0) {
						fn.notify(fn._t('Нужны название и хотя бы одна ссылка'));
						return;
					}
					addSubBtn.disabled = true;
					addSubBtn.textContent = fn._t('Скачиваю…');
					fn.call.addSubscription(nameI.value.trim(), urls, 21600, uaSel.value, hwidChk.checked).then(function(res) {
						if (res && res.ok) {
							added.style.display = '';
							added.textContent = '';
							added.appendChild(E('div', { 'class': 'fn-rowitem', style: 'border:none;padding:4px 0' }, [
								E('span', { 'class': 'fn-dot g' }),
								E('div', { 'class': 'fn-rowname' }, fn._t('Подписка «%s» добавлена — ноды скачиваются в фоне', nameI.value.trim()))
							]));
							addSubBtn.style.display = 'none';
							return;
						}
						addSubBtn.disabled = false;
						addSubBtn.textContent = fn._t('＋ Добавить подписку');
						fn.notify((res && res.error) || fn._t('Ошибка добавления подписки'));
					})['catch'](function() {
						addSubBtn.disabled = false;
						addSubBtn.textContent = fn._t('＋ Добавить подписку');
						fn.notify(fn._t('Метод add_subscription недоступен'));
					});
				});
				var nodeI = E('input', { placeholder: fn._t('…или ссылка на одну ноду: vless:// trojan:// hy2:// …'), style: 'width:100%' });
				var addNodeBtn = btn(fn._t('＋ Добавить ноду'), '', function() {
					var link = nodeI.value.trim();
					var r = fn.parseShareLink(link);
					if (!r || !r.outbound) {
						fn.notify(r && r.error ? r.error : fn._t('Не похоже на ссылку ноды'));
						return;
					}
					addNodeBtn.disabled = true;
					fn.call.addNode(r.meta.label, JSON.stringify(r.outbound), 'Manual').then(function(res) {
						if (res && res.ok) {
							added.style.display = '';
							added.textContent = '';
							added.appendChild(E('div', { 'class': 'fn-rowitem', style: 'border:none;padding:4px 0' }, [
								E('span', { 'class': 'fn-dot g' }),
								E('div', { 'class': 'fn-rowname' }, fn._t('Нода «%s» добавлена', r.meta.label))
							]));
							addNodeBtn.style.display = 'none';
							nodeI.style.display = 'none';
							return;
						}
						addNodeBtn.disabled = false;
						fn.notify((res && res.error) || fn._t('Ошибка добавления ноды'));
					})['catch'](function() {
						addNodeBtn.disabled = false;
						fn.notify(fn._t('Метод add_node недоступен'));
					});
				});
				kids = shell(fn._t('Источник нод'),
					fn._t('Подписка удобнее: ноды обновляются сами, а если ссылку забанят — уйдёт на резервную. Можно пропустить и добавить позже на странице «Пул нод».'),
					[ nameI, url1, url2, uaSel,
						E('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px' }, [
							E('div', { 'class': 'fn-opt-desc' }, fn._t('HWID-заголовки — включи, если панель отдаёт заглушку «приложение не поддерживается»')),
							E('label', { 'class': 'fn-tgl' }, [ hwidChk, E('span', { 'class': 'tk' }) ])
						]),
						addSubBtn,
						E('div', { style: 'display:flex;gap:10px' }, [ nodeI, addNodeBtn ]),
						added
					],
					[ skipBtn(),
						btn(fn._t('← Назад'), '', function() { wiz.step = 0; renderStep(); }),
						btn(fn._t('Далее →'), 'primary', function() { wiz.step = 2; renderStep(); }) ]);
			} else if (wiz.step === 2) {
				kids = shell(fn._t('Режим работы'),
					fn._t('Как решать, что пускать через туннель.'),
					[
						choice(fn._t('Умный'), fn._t('По правилам: выбранные списки — через туннель или оптимизацию доставки, остальное — напрямую. Рекомендуется.'), wiz.mode === 'smart', function() { wiz.mode = 'smart'; renderStep(); }),
						choice(fn._t('Глобальный'), fn._t('Весь трафик всех устройств — через активную ноду. Для параноиков и тестов.'), wiz.mode === 'global', function() { wiz.mode = 'global'; renderStep(); })
					],
					[ skipBtn(),
						btn(fn._t('← Назад'), '', function() { wiz.step = 1; renderStep(); }),
						btn(fn._t('Далее →'), 'primary', function() {
							fn.call.setGlobal('mode', wiz.mode).then(function() {
								wiz.step = 3; renderStep();
							})['catch'](function() { wiz.step = 3; renderStep(); });
						}) ]);
			} else if (wiz.step === 3) {
				kids = shell('Kill Switch',
					fn._t('Что делать, если все ноды упали.'),
					[
						choice(fn._t('Перекрыть интернет'), fn._t('Ни один байт не уйдёт мимо туннеля. Максимум приватности, но при обрыве интернет «ляжет».'), wiz.ks === 'kill', function() { wiz.ks = 'kill'; renderStep(); }),
						choice(fn._t('Прямой выход'), fn._t('При обрыве трафик пойдёт через провайдера — интернет останется, но без туннеля. Рекомендуется для дома.'), wiz.ks === 'direct', function() { wiz.ks = 'direct'; renderStep(); }),
						choice(fn._t('Ничего не делать'), fn._t('Трафик просто остановится до восстановления нод.'), wiz.ks === 'nothing', function() { wiz.ks = 'nothing'; renderStep(); })
					],
					[ skipBtn(),
						btn(fn._t('← Назад'), '', function() { wiz.step = 2; renderStep(); }),
						btn(fn._t('Далее →'), 'primary', function() {
							fn.call.setFallback(0, wiz.ks, wiz.autoReturn || '1', '').then(function() {
								wiz.step = 4; renderStep();
							})['catch'](function() { wiz.step = 4; renderStep(); });
						}) ]);
			} else {
				kids = shell(fn._t('Всё готово ✨'),
					fn._t('Морок настроен. Сейчас конфигурация применится и сервис перезапустится — это займёт несколько секунд.'),
					[
						E('div', { 'class': 'fn-rowitem', style: 'border:none;padding:6px 0' }, [
							E('span', { 'class': 'fn-dot g' }),
							E('div', { 'class': 'fn-rowname' }, fn._t('Режим: %s', wiz.mode === 'global' ? fn._t('Глобальный') : fn._t('Умный')))
						]),
						E('div', { 'class': 'fn-rowitem', style: 'border:none;padding:6px 0' }, [
							E('span', { 'class': 'fn-dot g' }),
							E('div', { 'class': 'fn-rowname' }, fn._t('Kill Switch: %s', ({ kill: fn._t('перекрыть интернет'), direct: fn._t('прямой выход'), nothing: fn._t('выключен') })[wiz.ks]))
						])
					],
					[ btn(fn._t('← Назад'), '', function() { wiz.step = 3; renderStep(); }),
						btn(fn._t('Завершить и применить'), 'primary', finish) ]);
			}
			kids.forEach(function(k) { body.appendChild(k); });
		}

		renderStep();
		document.body.appendChild(overlay);
	},

	/* ---------- Wave 2: бэкап / восстановление (2.5) ---------- */
	renderBackupCard: function() {
		var fileInput = E('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });

		var dlBtn = E('button', { 'class': 'fn-btn' }, fn._t('⬇ Скачать бэкап'));
		dlBtn.addEventListener('click', function() {
			dlBtn.disabled = true;
			fn.call.backup().then(function(res) {
				dlBtn.disabled = false;
				if (!res || typeof res.json !== 'string') {
					fn.notify((res && res.error) || fn._t('Бэкенд не вернул бэкап'));
					return;
				}
				var blob = new Blob([ res.json ], { type: 'application/json' });
				var a = E('a', {
					href: URL.createObjectURL(blob),
					download: 'morok-backup-' + new Date().toISOString().slice(0, 10) + '.json'
				});
				document.body.appendChild(a);
				a.click();
				setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
				fn.notify(fn._t('Бэкап сохранён'));
			})['catch'](function() {
				dlBtn.disabled = false;
				fn.notify(fn._t('Метод backup пока недоступен'));
			});
		});

		fileInput.addEventListener('change', function() {
			var f = fileInput.files && fileInput.files[0];
			if (!f) return;
			var reader = new FileReader();
			reader.onload = function() {
				var text = String(reader.result || '');
				if (!confirm(fn._t('Восстановить конфигурацию из файла «%s»?\nТекущие настройки Морока будут перезаписаны.', f.name))) {
					fileInput.value = '';
					return;
				}
				fn.call.restore(text).then(function(res) {
					if (res && res.ok === false) {
						fn.notify(res.error || fn._t('Восстановление не удалось'));
						return;
					}
					fn.notify(fn._t('Конфигурация восстановлена — перезагружаю страницу…'));
					setTimeout(function() { location.reload(); }, 1500);
				})['catch'](function() {
					fn.notify(fn._t('Метод restore пока недоступен'));
				});
			};
			reader.readAsText(f);
		});

		var upBtn = E('button', { 'class': 'fn-btn', click: function() { fileInput.click(); } }, fn._t('⬆ Восстановить'));

		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-spread' }, [
				E('div', [
					E('div', { 'class': 'fn-card-title' }, fn._t('Конфигурация')),
					E('div', { 'class': 'fn-card-sub' }, fn._t('бэкап всех настроек Морока одним JSON-файлом — перед экспериментами или переездом на другой роутер'))
				]),
				E('div', { style: 'display:flex;gap:10px;flex-shrink:0' }, [ dlBtn, upBtn ])
			]),
			fileInput
		]);
	},

	/* баннер-предложение пройти мастер, когда backend не отдаёт wizard_done */
	renderWizardBanner: function(st) {
		var self = this;
		var card = E('div', { 'class': 'fn-card', style: 'margin-bottom:16px' }, [
			E('div', { 'class': 'fn-spread' }, [
				E('div', [
					E('div', { 'class': 'fn-card-title' }, fn._t('🪄 Похоже, Морок ещё не настраивался')),
					E('div', { 'class': 'fn-card-sub' }, fn._t('мастер первого запуска проведёт за минуту: подписка → режим → kill switch'))
				]),
				E('div', { style: 'display:flex;gap:10px;flex-shrink:0' }, [
					E('button', { 'class': 'fn-btn', click: function() { card.remove(); } }, fn._t('Позже')),
					E('button', { 'class': 'fn-btn primary', click: function() {
						card.remove();
						self.showWizard(st);
					} }, fn._t('Пройти мастер'))
				])
			])
		]);
		return card;
	},

	render: function(data) {
		fn.loadCSS();
		var st = data[0] || {};
		var chainData = data[1] || {};
		var nodesData = data[2] || {};
		var rulesData = data[3] || {};
		var mxData = data[4] || null;
		var self = this;

		var root = E('div', [
			E('div', { id: 'fn-kill-slot' }, this.renderKillBanner(st)),
			E('div', { id: 'fn-hero-slot' }, this.renderHero(st)),
			E('div', { id: 'fn-wiz-slot' }),

			E('div', { 'class': 'fn-stats fn-mt', style: 'grid-template-columns:repeat(5,1fr)' }, [
				E('div', { 'class': 'fn-stat' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('Туннель')),
					E('div', { 'class': 'fn-stat-value', id: 'fn-st-running', style: 'font-size:16px;padding-top:4px' }, '—'),
					E('div', { 'class': 'fn-stat-foot', id: 'fn-st-mode' }, fn._t('sing-box · конфиг из UCI'))
				]),
				E('div', { 'class': 'fn-stat' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('Активная нода')),
					E('div', { 'class': 'fn-stat-value', id: 'fn-st-node', style: 'font-size:16px;padding-top:4px' }, '—'),
					E('div', { 'class': 'fn-stat-foot', id: 'fn-st-ping' }, '—')
				]),
				E('div', { 'class': 'fn-stat' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('Ноды')),
					E('div', { 'class': 'fn-stat-value', id: 'fn-st-nodes' }, '—'),
					E('div', { 'class': 'fn-stat-foot' }, fn._t('включённые и отвечающие'))
				]),
				E('div', { 'class': 'fn-stat' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('Правила')),
					E('div', { 'class': 'fn-stat-value', id: 'fn-st-rules', style: 'font-size:16px;padding-top:4px' }, '—'),
					E('div', { 'class': 'fn-stat-foot' }, fn._t('VPN / оптимизация / напрямую'))
				]),
				E('div', { 'class': 'fn-stat' }, [
					E('div', { 'class': 'fn-stat-label' }, fn._t('Подписки')),
					E('div', { 'class': 'fn-stat-value', id: 'fn-st-subs', style: 'font-size:16px;padding-top:4px' }, '—'),
					E('div', { 'class': 'fn-stat-foot' }, fn._t('последнее обновление'))
				])
			]),

			E('div', { 'class': 'fn-grid fn-mt', style: 'grid-template-columns:1.55fr 1fr' }, [
				E('div', { 'class': 'fn-card' }, [
					E('div', { 'class': 'fn-spread' }, [
						E('div', [
							E('div', { 'class': 'fn-card-title' }, fn._t('Фоллбэк-цепочка')),
							E('div', { 'class': 'fn-card-sub' }, fn._t('порядок автовыбора при отказе'))
						])
					]),
					E('div', { id: 'fn-chain-slot' }, this.renderChainStrip(chainData))
				]),
				this.renderQuickToggles(st)
			]),

			this.renderMetricsCard(),

			this.renderBackupCard(),

			E('div', { 'class': 'fn-card fn-mt' }, [
				E('div', { 'class': 'fn-spread' }, [
					E('div', [
						E('div', { 'class': 'fn-card-title' }, fn._t('Применение изменений')),
						E('div', { 'class': 'fn-card-sub' }, fn._t('настройки пишутся в UCI сразу; перегенерация конфига — по кнопке'))
					]),
					E('button', { 'class': 'fn-btn primary', click: function() {
						this.disabled = true;
						fn.call.apply().then(function() {
							fn.notify(fn._t('Перезапуск запущен — конфиг перегенерируется'));
							setTimeout(function() { location.reload(); }, 3000);
						});
					} }, fn._t('Применить и перезапустить'))
				])
			])
		]);

		// первичное заполнение карточек
		this.refreshStats(st, nodesData, rulesData, chainData);
		this.updateMetrics(mxData, rulesData, nodesData);

		// живой опрос: status + nodes + rules + chain + metrics каждые 10 с;
		// без мерцания — перерисовываем только изменившиеся значения
		var lastHeroSig = null;
		var lastChainSig = null;
		var lastMxTs = 0;
		poll.add(L.bind(function() {
			return Promise.all([
				L.resolveDefault(fn.call.status(), null),
				L.resolveDefault(fn.call.nodes(), null),
				L.resolveDefault(fn.call.rules(), null),
				L.resolveDefault(fn.call.chain(), null),
				L.resolveDefault(fn.call.metricsRead(), null)
			]).then(function(r) {
				var s = r[0]; if (!s) return;
				var heroSig = [ s.running, s.mode, s.active_node, s.active_label, s.active_ping,
					s.all_dead, s.active_broken, s.kill_switch, s.engine, (s.chain || []).join(',') ].join('|');
				if (heroSig !== lastHeroSig) {
					lastHeroSig = heroSig;
					var hero = document.getElementById('fn-hero-slot');
					if (hero) { hero.textContent = ''; hero.appendChild(self.renderHero(s)); }
					var kill = document.getElementById('fn-kill-slot');
					if (kill) { kill.textContent = ''; kill.appendChild(self.renderKillBanner(s)); }
				}
				var chainSig = r[3] ? JSON.stringify((r[3].fallback || {}).chain || []) : null;
				if (chainSig !== null && chainSig !== lastChainSig) {
					lastChainSig = chainSig;
					var slot = document.getElementById('fn-chain-slot');
					if (slot && r[2]) {
						// метрики в стрипе — из общего источника nodes
						var merged = { fallback: (r[3].fallback || {}), nodes: (r[1] || {}).nodes || [] };
						slot.textContent = '';
						slot.appendChild(self.renderChainStrip(merged));
					}
				}
				self.refreshStats(s, r[1], r[2], r[3]);
				// метрики перерисовываем только при новом семпле (updated) или смене статуса
				var mx = r[4];
				var mxSig = mx ? (mx.updated || 0) : -1;
				if (mxSig !== lastMxTs) {
					lastMxTs = mxSig;
					self.updateMetrics(mx, r[2], r[1]);
				}
			});
		}, this), 10);

		// мастер первого запуска (Wave 2, 2.1)
		var wizDone = (st.wizard_done === true || st.wizard_done === '1');
		if (!wizDone) {
			if (typeof st.wizard_done === 'undefined') {
				// backend не отдаёт поле — неброское предложение, не блокируем
				var slot = document.getElementById('fn-wiz-slot');
				if (slot) slot.appendChild(this.renderWizardBanner(st));
			} else {
				var self2 = this;
				setTimeout(function() { self2.showWizard(st); }, 500);
			}
		}

		return fn.page('dashboard', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
