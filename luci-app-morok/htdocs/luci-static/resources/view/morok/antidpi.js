'use strict';
'require view';
'require ui';
'require uci';
'require rpc';
'require morok.common as fn';

/* Оптимизация доставки (бывш. Анти-DPI) — Wave 5 UX-редизайн.
   Страница для человека без инженерного бэкграунда:
   - карточки профилей с человеческими описаниями и вердиктами диагностики
     прямо на карточке (✓ работает · 301 мс / ✗ не подходит / ★ рекомендовано);
   - «Диагностика доставки»: прогон батареи профилей сканером, итог —
     рекомендация лучшего профиля; последний результат хранится в
     scan_state.json (scan_status) и переживает перезагрузку страницы;
   - редактор своей стратегии: валидация на клиенте + живой предпросмотр
     «что получится» (фильтры и приёмы из строки аргументов);
   - адаптивный сторож: человеческое объяснение поведения + настройки
     fail_threshold/check_interval/rescan_interval. Backend-метода нет,
     но guardian.sh перечитывает UCI на каждом тике, а ACL luci-app-morok
     покрывает uci morok — пишем напрямую (прецедент: market.js);
   - связь с маршрутизацией: какие правила используют оптимизацию.
   Контракты backend (трек C, структуру не меняем):
   get_antidpi / set_antidpi / test_antidpi /
   scan_start / scan_status / scan_apply / scan_stop / rules. */

var uciCommit = rpc.declare({ object: 'uci', method: 'commit', params: [ 'config' ] });

/* Человеческие описания профилей (ключ = id стратегии backend).
   Backend отдаёт label/desc — используем как фоллбэк, если профиль новый. */
var PROFILE_INFO = {
	youtube: {
		emoji: '📺',
		simple: 'Мягкая обработка пакетов для видеохостингов: почти не вмешивается в трафик, ' +
			'задержки не добавляет.',
		when: 'Начните с него — в большинстве сетей этого достаточно.'
	},
	universal: {
		emoji: '🧰',
		simple: 'Более настойчивый профиль: использует несколько приёмов сразу, ' +
			'чтобы доставка работала даже в «сложных» сетях.',
		when: 'Выбирайте, если мягкий профиль не помог — или если диагностика его рекомендовала.'
	},
	custom: {
		emoji: '🛠',
		simple: 'Своя строка параметров движка: полный контроль для тех, кто подбирает ' +
			'настройки под своего провайдера вручную.',
		when: 'Сюда же попадает профиль, который подобрала диагностика из расширенной батареи.'
	}
};

/* соответствие «эталонных» профилей батареи сканера стратегиям
   (scan_profiles.txt: ref-youtube/ref-universal — те же аргументы,
   что у стратегий youtube/universal в antidpi.sh) */
var SCAN_REF = { youtube: 'ref-youtube', universal: 'ref-universal' };

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fn.call.getAntidpi(), null),
			L.resolveDefault(fn.call.rules(), { rules: [] }),
			L.resolveDefault(uci.load('morok'), null)
		]);
	},

	/* локальное состояние страницы */
	sel: 'youtube',
	custom: '',
	data: null,
	rules: [],

	strategyLabel: function(id) {
		var list = (this.data && this.data.strategies) || [];
		for (var i = 0; i < list.length; i++)
			if (list[i].id === id) return list[i].label;
		return id;
	},

	/* ---------- сканер профилей доставки ---------- */
	scan: null,
	scanTimer: null,
	scanApplying: '',
	scanFresh: false,   /* прогон завершился на глазах у пользователя — таблицу показываем развёрнутой */

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
				self.refreshProfiles();
				if (wasRunning && st.running !== true) {
					clearInterval(self.scanTimer); self.scanTimer = null;
					self.scanFresh = true;
					self.renderScanBody();
					self.refreshProfiles();
					/* прогон кончился — движок перезапущен с исходной
					   стратегией, освежаем статус-карточку */
					fn.call.getAntidpi().then(function(nd) {
						if (nd) { self.data = nd; self.refreshStatus(); }
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

	/* агрегат по профилю батареи: сколько доменов доставлено, средняя задержка */
	scanAgg: function(r) {
		var domains = (this.scan && this.scan.domains) || [];
		var ok = 0, msSum = 0, msN = 0;
		domains.forEach(function(d) {
			var dr = r.domain_results ? r.domain_results[d] : null;
			if (dr && dr.code && dr.code !== '000') {
				ok++;
				if (dr.ms) { msSum += dr.ms; msN++; }
			}
		});
		return { ok: ok, total: domains.length, ms: msN ? Math.round(msSum / msN) : 0 };
	},

	/* лучший профиль прогона: все домены доставлены, минимальная задержка */
	bestScanResult: function() {
		var self = this;
		var best = null, bestMs = 0;
		((this.scan && this.scan.results) || []).forEach(function(r) {
			var a = self.scanAgg(r);
			if (a.total > 0 && a.ok === a.total && (best === null || a.ms < bestMs)) {
				best = r; bestMs = a.ms;
			}
		});
		return best ? { r: best, ms: bestMs } : null;
	},

	/* вердикт диагностики для карточки стратегии (по эталону батареи) */
	scanVerdictFor: function(strategyId) {
		var bid = SCAN_REF[strategyId];
		if (!bid || !this.scan || !Array.isArray(this.scan.results)) return null;
		var found = null;
		this.scan.results.forEach(function(r) { if (r.id === bid) found = r; });
		if (!found) return null;
		var a = this.scanAgg(found);
		if (a.total === 0) return null;
		if (a.ok === a.total)
			return { cls: 'g', text: fn._t('✓ работает') + (a.ms ? ' · ' + a.ms + fn._t(' мс') : '') };
		if (a.ok > 0)
			return { cls: 'y', text: fn._t('~ работает не для всех проверок') };
		return { cls: 'r', text: fn._t('✗ не подходит') };
	},

	scanDomainPill: function(dr) {
		if (!dr) return E('span', { 'class': 'fn-pill dim' }, '—');
		if (dr.code && dr.code !== '000')
			return E('span', { 'class': 'fn-pill g' },
				'✓ ' + dr.code + (dr.ms ? ' · ' + dr.ms + fn._t(' мс') : ''));
		return E('span', { 'class': 'fn-pill r' }, '✗' + (dr.ms ? ' · ' + dr.ms + fn._t(' мс') : ''));
	},

	buildScanCard: function() {
		var self = this;
		var st = this.scan || {};
		var running = st.running === true;
		var results = st.results || [];
		var domains = (st.domains && st.domains.length) ? st.domains : [ 'youtube.com', 'googlevideo.com' ];
		var total = st.total || 0;

		/* поле «что проверяем»: свои домены через запятую (до 4 — лимит backend) */
		var domInput = E('input', {
			placeholder: 'youtube.com, googlevideo.com',
			style: 'min-width:220px;flex:1',
			value: domains.join(', ')
		});

		var startBtn = E('button', { 'class': 'fn-btn primary' }, fn._t('🔍 Запустить диагностику'));
		startBtn.disabled = running || self.scanApplying !== '';
		startBtn.addEventListener('click', function() {
			var doms = String(domInput.value || '').split(',').map(function(s) {
				return s.trim().toLowerCase();
			}).filter(function(s) { return s !== ''; });
			startBtn.disabled = true;
			startBtn.textContent = fn._t('Запускаю…');
			fn.call.scanStart(doms.length ? doms : null).then(function(res) {
				if (!res || res.ok === false) {
					fn.notify('✗ ' + ((res && res.error) || fn._t('scan_start недоступен')));
					startBtn.disabled = false;
					startBtn.textContent = fn._t('🔍 Запустить диагностику');
					return;
				}
				self.scan = { running: true, done: 0, total: res.total || 0,
					results: [], domains: res.domains || [] };
				self.scanFresh = false;
				self.renderScanBody();
				self.refreshProfiles();
				self.pollScan();
			})['catch'](function() {
				fn.notify(fn._t('метод scan_start недоступен'));
				startBtn.disabled = false;
				startBtn.textContent = fn._t('🔍 Запустить диагностику');
			});
		});

		var stopBtn = E('button', { 'class': 'fn-btn sm' }, fn._t('⏹ Остановить'));
		stopBtn.addEventListener('click', function() {
			stopBtn.disabled = true;
			stopBtn.textContent = fn._t('Останавливаю…');
			fn.call.scanStop().then(function(res) {
				if (res && res.ok === false)
					fn.notify('✗ ' + (res.error || fn._t('не остановлено')));
				else
					fn.notify(fn._t('Диагностика остановлена, прежний профиль восстановлен'));
				fn.call.scanStatus().then(function(st2) {
					if (st2) { self.scan = st2; self.renderScanBody(); self.refreshProfiles(); }
					if (self.scanTimer) { clearInterval(self.scanTimer); self.scanTimer = null; }
					fn.call.getAntidpi().then(function(nd) {
						if (nd) { self.data = nd; self.refreshStatus(); }
					});
				});
			})['catch'](function() { fn.notify(fn._t('метод scan_stop недоступен')); });
		});

		var progressText = '';
		if (running) {
			var cur = st.current_label || st.current || '';
			progressText = fn._t('⏳ профиль %s/%s%s',
				Math.min((st.done || 0) + 1, total || 1), total,
				cur ? ': ' + cur + '…' : '…');
		} else if ((st.done || 0) > 0) {
			progressText = fn._t(st.stopped === true ? '⏹ остановлено: %s' : '✓ готово: %s',
				fn._t('%s/%s профилей проверено', st.done, total)) +
				(st.started ? ' · ' + fn.agoText(st.started) : '');
		}

		/* ---- рекомендация по итогам прогона ---- */
		var recoBox = E('div');
		if (!running && results.length) {
			var best = self.bestScanResult();
			var okCount = 0;
			results.forEach(function(r) {
				var a = self.scanAgg(r);
				if (a.ok > 0) okCount++;
			});
			if (best) {
				var refOf = best.r.id === 'ref-youtube' ? 'youtube'
					: best.r.id === 'ref-universal' ? 'universal' : null;
				var recoKids = [
					E('span', { style: 'font-size:17px;line-height:1' }, '★'),
					E('div', { style: 'flex:1;min-width:0' }, [
						E('div', { 'class': 'fn-verdict-title' },
							fn._t('Рекомендуем: %s', (best.r.label || best.r.id) +
								(best.ms ? ' · ' + best.ms + fn._t(' мс') : ''))),
						E('div', { 'class': 'fn-verdict-note' }, refOf
							? fn._t('Это тот же профиль, что в карточке выше — просто выберите её и нажмите «Применить».')
							: fn._t('Профиль из расширенной батареи — применится как «Своя стратегия».'))
					])
				];
				if (!refOf) {
					var recoBtn = E('button', { 'class': 'fn-btn sm primary' }, fn._t('Применить'));
					recoBtn.disabled = self.scanApplying !== '';
					recoBtn.addEventListener('click', function() {
						self.scanApplying = best.r.id;
						recoBtn.disabled = true;
						recoBtn.textContent = fn._t('Применяю…');
						fn.call.scanApply(best.r.id).then(function(res) {
							self.scanApplying = '';
							if (!res || res.ok === false)
								fn.notify('✗ ' + ((res && res.error) || fn._t('scan_apply недоступен')));
							else
								fn.notify(fn._t('✓ Профиль «%s» применён%s',
									res.label || best.r.label || best.r.id,
									res.running ? '' : fn._t(' — но движок не поднялся, см. журнал')));
							fn.call.getAntidpi().then(function(nd) {
								if (nd) {
									self.data = nd;
									self.sel = nd.strategy || self.sel;
									self.custom = nd.strategy_custom || self.custom;
									self.refresh();
								}
							});
						})['catch'](function() {
							self.scanApplying = '';
							fn.notify(fn._t('метод scan_apply недоступен'));
						});
					});
					recoKids.push(recoBtn);
				}
				recoBox.appendChild(E('div', { 'class': 'fn-verdict ok', style: 'margin-top:11px' }, recoKids));
			} else {
				recoBox.appendChild(E('div', { 'class': 'fn-verdict bad', style: 'margin-top:11px' }, [
					E('span', { style: 'font-size:17px;line-height:1' }, '🛡'),
					E('div', [
						E('div', { 'class': 'fn-verdict-title' }, fn._t('Ни один профиль не доставил все проверки')),
						E('div', { 'class': 'fn-verdict-note' },
							fn._t('Оптимизация в этой сети может не помочь — надёжнее перевести правила в режим «через VPN» на странице «Маршрутизация».'))
					])
				]));
			}
		}

		/* ---- таблица результатов (строчная, флексами — E() в GL-сборке
		   не разворачивает вложенные массивы, дети только плоские) ---- */
		var table = null;
		if (results.length) {
			var headCells = [ E('div', { style: 'flex:1.4;min-width:0;font-weight:700;color:var(--fn-muted2)' }, fn._t('Профиль')) ];
			domains.forEach(function(d) {
				headCells.push(E('div', { style: 'flex:1;min-width:0;font-weight:700;color:var(--fn-muted2)' }, d));
			});
			headCells.push(E('div', { style: 'width:96px' }, ''));

			table = E('div', { style: 'margin-top:6px;font-size:12.5px' },
				E('div', { style: 'display:flex;gap:8px;padding:6px 10px;border-bottom:1px solid var(--fn-border2)' }, headCells));

			var bestId = null;
			var b = self.bestScanResult();
			if (b) bestId = b.r.id;

			results.forEach(function(r) {
				var a = self.scanAgg(r);
				var okAny = a.ok > 0;
				var cells = [ E('div', { style: 'flex:1.4;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
					title: r.id }, [
					r.label || r.id,
					r.id === bestId ? E('span', { 'class': 'fn-badge hl', style: 'margin-left:7px' }, fn._t('★ лучший')) : ''
				]) ];
				domains.forEach(function(d) {
					var dr = r.domain_results ? r.domain_results[d] : null;
					cells.push(E('div', { style: 'flex:1;min-width:0' }, self.scanDomainPill(dr)));
				});
				var btnCell = E('div', { style: 'width:96px;text-align:right' }, '');
				if (okAny) {
					var applyBtn = E('button', { 'class': 'fn-btn sm' }, fn._t('Применить'));
					applyBtn.disabled = running || self.scanApplying !== '';
					applyBtn.addEventListener('click', function() {
						self.scanApplying = r.id;
						applyBtn.disabled = true;
						applyBtn.textContent = fn._t('Применяю…');
						fn.call.scanApply(r.id).then(function(res) {
							self.scanApplying = '';
							if (!res || res.ok === false) {
								fn.notify('✗ ' + ((res && res.error) || fn._t('scan_apply недоступен')));
							} else {
								fn.notify(fn._t('✓ Профиль «%s» применён%s',
									res.label || r.label || r.id,
									res.running ? '' : fn._t(' — но движок не поднялся, см. журнал')));
							}
							self.renderScanBody();
							fn.call.getAntidpi().then(function(nd) {
								if (nd) {
									self.data = nd;
									self.sel = nd.strategy || self.sel;
									self.custom = nd.strategy_custom || self.custom;
									self.refresh();
								}
							});
						})['catch'](function() {
							self.scanApplying = '';
							fn.notify(fn._t('метод scan_apply недоступен'));
							self.renderScanBody();
						});
					});
					btnCell.textContent = '';
					btnCell.appendChild(applyBtn);
				}
				table.appendChild(E('div', { style: 'display:flex;gap:8px;padding:7px 10px;border-bottom:1px solid var(--fn-border);align-items:center' +
					(r.id === bestId ? ';background:var(--fn-green-bg);border-radius:8px' : '') }, cells));
			});
		}

		/* свежий прогон — таблица развёрнута; старый результат — свёрнута в details */
		var tableWrap = null;
		if (table) {
			if (running || self.scanFresh) {
				tableWrap = E('div', { 'class': 'fn-scan-table' }, table);
			} else {
				var det = E('details', { 'class': 'fn-hostlist', style: 'margin-top:11px' }, [
					E('summary', {}, fn._t('Все результаты (%s профилей)', results.length)),
					E('div', { 'class': 'fn-scan-table' }, table)
				]);
				tableWrap = det;
			}
		}

		var ctrlKids = [ startBtn ];
		if (running) ctrlKids.push(stopBtn);

		var bodyKids = [
			E('div', { 'class': 'fn-card-title' }, fn._t('Диагностика доставки')),
			E('div', { 'class': 'fn-card-sub' },
				fn._t('Не знаете, какой профиль выбрать? Роутер сам проверит всю батарею (%s профилей) на ваших сервисах и подскажет лучший. По окончании вернётся прежний профиль.', total || '—')),
			E('div', { style: 'display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap' }, ctrlKids),
			E('div', { style: 'display:flex;gap:10px;align-items:center;margin-top:9px;flex-wrap:wrap' }, [
				E('span', { 'class': 'fn-card-sub', style: 'margin-top:0;white-space:nowrap' }, fn._t('Что проверяем:')),
				domInput
			])
		];
		if (progressText)
			bodyKids.push(E('div', { 'class': 'fn-card-sub', style: 'margin-top:9px' }, progressText));
		bodyKids.push(recoBox);
		if (tableWrap) bodyKids.push(tableWrap);
		else if (running)
			bodyKids.push(E('div', { 'class': 'fn-card-sub', style: 'margin-top:9px' },
				fn._t('первые результаты появятся через несколько секунд…')));
		bodyKids.push(E('div', { 'class': 'fn-card-sub', style: 'margin-top:10px;opacity:.75' },
			fn._t('⚠ во время проверки движок оптимизации кратковременно перезапускается; трафик правил в режиме «через VPN» не затрагивается.')));

		return E('div', { 'class': 'fn-card fn-mt' }, bodyKids);
	},

	/* ---------- карточка статуса ---------- */
	buildStatusCard: function() {
		var d = this.data;
		var engineName = d.engine === 'zapret2' ? 'nfqws2 (zapret2)' : d.engine;
		var engPill;
		if (d.engine === 'none')
			engPill = E('span', { 'class': 'fn-pill dim' }, fn._t('выключен'));
		else if (d.running)
			engPill = E('span', { 'class': 'fn-pill g' }, fn._t('работает'));
		else
			engPill = E('span', { 'class': 'fn-pill r' }, fn._t('остановлен'));

		var g = d.guardian || { mode: 'off', state_text: '' };
		var gCls = g.mode === 'proxy' ? 'y' : g.mode === 'mixed' ? 'y' : g.mode === 'off' ? 'dim' : 'g';
		var gText = { off: fn._t('сторож: правил нет'), proxy: fn._t('сторож: увёл в VPN'),
			mixed: fn._t('сторож: часть правил в VPN'), antidpi: fn._t('сторож: оптимизация активна') }[g.mode] || g.mode;

		return E('div', { 'class': 'fn-card' }, [
			E('div', { 'class': 'fn-spread' }, [
				E('div', [
					E('div', { 'class': 'fn-card-title' }, fn._t('Статус движка')),
					E('div', { 'class': 'fn-card-sub' }, fn._t('оптимизация доставки пакетов на лету, без VPN'))
				]),
				engPill
			]),
			E('div', { style: 'margin-top:12px' }, [
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, fn._t('Движок')),
						E('div', { 'class': 'fn-opt-desc' }, engineName)
					]),
					E('span', { 'class': 'fn-dot ' + (d.running ? 'g' : d.engine === 'none' ? 'dim' : 'r') })
				]),
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, fn._t('Активный профиль')),
						E('div', { 'class': 'fn-opt-desc' }, fn._t('как сейчас обрабатываются пакеты'))
					]),
					E('span', { 'class': 'fn-badge violet' }, this.strategyLabel(d.strategy))
				]),
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, fn._t('Адаптивный сторож')),
						E('div', { 'class': 'fn-opt-desc' }, g.state_text || '—')
					]),
					E('span', { 'class': 'fn-pill ' + gCls }, gText)
				]),
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, fn._t('Доменов в хостлисте')),
						E('div', { 'class': 'fn-opt-desc' },
							fn._t('%s вкл. правил «Оптимизация» + сиды профиля', d.rules_count || 0))
					]),
					E('span', { 'class': 'fn-pill b' }, String((d.hostlist || []).length))
				])
			])
		]);
	},

	refreshStatus: function() {
		if (!this.statusBox) return;
		this.statusBox.textContent = '';
		this.statusBox.appendChild(this.buildStatusCard());
	},

	/* ---------- профили: карточки ---------- */

	/* предпросмотр custom-строки: какие фильтры и приёмы получатся */
	parseCustomPreview: function(s) {
		var filters = [], funcs = [];
		var m;
		var reF = /--filter-(tcp|udp)=(\d+)/g;
		while ((m = reF.exec(s)) !== null)
			filters.push(m[1].toUpperCase() + ' ' + m[2]);
		var reD = /--lua-desync=([a-z0-9_]+)/gi;
		while ((m = reD.exec(s)) !== null)
			if (funcs.indexOf(m[1]) === -1) funcs.push(m[1]);
		return { filters: filters, funcs: funcs };
	},

	/* клиентская валидация custom-строки (серверная — dry-run в set_antidpi) */
	customCheck: function(s) {
		var t = String(s || '').trim();
		if (t === '') return { err: fn._t('строка пустая — вставьте аргументы nfqws2') };
		if (/[\r\n]/.test(s)) return { err: fn._t('стратегия должна быть одной строкой') };
		if (s.length > 2000) return { err: fn._t('слишком длинно: максимум 2000 символов') };
		if (!/--filter-(tcp|udp)=/.test(t))
			return { err: fn._t('нет ни одного фильтра — нужен хотя бы один --filter-tcp= или --filter-udp=') };
		if (!/--lua-desync=/.test(t))
			return { warn: fn._t('нет приёмов обработки (--lua-desync=…) — пакеты пойдут без изменений') };
		return null;
	},

	buildCustomEditor: function() {
		var self = this;
		var ta = E('textarea', {
			placeholder: '--filter-tcp=443 --hostlist=... --lua-desync=multisplit:pos=1,midsld --new ...',
			spellcheck: 'false'
		}, self.custom);
		var hint = E('div', { 'class': 'fn-card-sub', style: 'margin-top:7px' });
		var preview = E('div', { style: 'margin-top:8px;display:flex;gap:6px;flex-wrap:wrap' });

		function update() {
			self.custom = ta.value;
			hint.style.color = '';
			preview.textContent = '';
			var t = String(ta.value || '').trim();
			if (t === '') {
				hint.textContent = fn._t('Пример: --filter-tcp=443 --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443 --lua-desync=drop');
				return;
			}
			var chk = self.customCheck(ta.value);
			if (chk && chk.err) {
				hint.style.color = 'var(--fn-red)';
				hint.textContent = '✗ ' + chk.err;
				return;
			}
			if (chk && chk.warn) {
				hint.style.color = 'var(--fn-yellow)';
				hint.textContent = '⚠ ' + chk.warn;
			} else {
				hint.textContent = fn._t('✓ выглядит корректно — перед применением движок ещё прогонит самопроверку (dry-run)');
			}
			var pv = self.parseCustomPreview(ta.value);
			pv.filters.forEach(function(f) {
				preview.appendChild(E('span', { 'class': 'fn-pill b' }, f));
			});
			pv.funcs.forEach(function(f) {
				preview.appendChild(E('span', { 'class': 'fn-pill dim' }, '⚙ ' + f));
			});
		}
		ta.addEventListener('input', update);
		ta.addEventListener('click', function(ev) { ev.stopPropagation(); });
		update();

		return E('div', { style: 'margin-top:10px' }, [ ta, hint, preview ]);
	},

	buildProfilesCard: function() {
		var self = this;
		var d = this.data;
		var best = this.bestScanResult();
		var bestRef = null;
		if (best) {
			if (best.r.id === 'ref-youtube') bestRef = 'youtube';
			else if (best.r.id === 'ref-universal') bestRef = 'universal';
		}

		var grid = E('div', { 'class': 'fn-prof-grid' });

		(d.strategies || []).forEach(function(st) {
			var info = PROFILE_INFO[st.id] || { emoji: '🧩', simple: st.desc || '', when: '' };
			var selected = self.sel === st.id;
			var isActive = d.strategy === st.id;
			var verdict = self.scanVerdictFor(st.id);

			var nameKids = [
				st.label,
				isActive ? E('span', { 'class': 'fn-badge hl' }, fn._t('активна')) : ''
			];
			if (bestRef === st.id)
				nameKids.push(E('span', { 'class': 'fn-badge reco' }, fn._t('★ рекомендовано')));

			var bodyKids = [
				E('div', { 'class': 'fn-prof-simple' }, fn._t(info.simple)),
				info.when ? E('div', { 'class': 'fn-prof-when' }, '💡 ' + fn._t(info.when)) : ''
			];
			if (verdict)
				bodyKids.push(E('div', { style: 'margin-top:9px' },
					E('span', { 'class': 'fn-pill ' + verdict.cls, title: fn._t('По итогам последней диагностики') },
						verdict.text)));
			if (st.id === 'custom')
				bodyKids.push(self.buildCustomEditor());

			var card = E('div', {
				'class': 'fn-prof' + (selected ? ' on' : ''),
				click: function() {
					self.sel = st.id;
					self.refreshProfiles();
				}
			}, [
				E('div', { 'class': 'fn-prof-head' }, [
					E('span', { 'class': 'fn-prof-emoji' }, info.emoji),
					E('div', { style: 'flex:1;min-width:0' }, [
						E('div', { 'class': 'fn-strat-name' }, nameKids),
						E('div', { 'class': 'fn-strat-desc' }, st.desc || '')
					]),
					E('span', { 'class': 'fn-radio' + (selected ? ' sel' : '') })
				]),
				E('div', { style: 'margin-top:10px' }, bodyKids)
			]);
			grid.appendChild(card);
		});

		var applyBtn = E('button', { 'class': 'fn-btn primary' }, fn._t('Применить профиль'));
		var applyNote = E('div', { 'class': 'fn-card-sub', style: 'margin-top:9px' });
		applyBtn.addEventListener('click', function() {
			if (self.sel === 'custom') {
				var chk = self.customCheck(self.custom);
				if (chk && chk.err) {
					applyNote.style.color = 'var(--fn-red)';
					applyNote.textContent = '✗ ' + chk.err;
					return;
				}
			}
			applyBtn.disabled = true;
			applyBtn.textContent = fn._t('Проверяю и применяю…');
			applyNote.textContent = '';
			fn.call.setAntidpi(self.sel, '', self.sel === 'custom' ? self.custom : null)
				.then(function(res) {
					applyBtn.disabled = false;
					applyBtn.textContent = fn._t('Применить профиль');
					if (!res || res.ok === false) {
						applyNote.textContent = '✗ ' + ((res && res.error) || fn._t('не удалось применить'));
						applyNote.style.color = 'var(--fn-red)';
						return;
					}
					applyNote.style.color = '';
					applyNote.textContent = '✓ ' + (res.note || fn._t('применено'));
					/* освежаем статус: движок/стратегия/хостлист перечитались */
					fn.call.getAntidpi().then(function(nd) {
						if (nd) { self.data = nd; self.refresh(); }
					});
				})['catch'](function() {
					applyBtn.disabled = false;
					applyBtn.textContent = fn._t('Применить профиль');
					applyNote.textContent = fn._t('✗ метод set_antidpi недоступен');
					applyNote.style.color = 'var(--fn-red)';
				});
		});

		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-title' }, fn._t('Профиль оптимизации')),
			E('div', { 'class': 'fn-card-sub' },
				fn._t('Профиль — это способ обработки пакетов. Выберите готовый или запустите диагностику ниже — она сама подскажет, что работает в вашей сети. Перед применением движок прогоняет самопроверку: битый профиль не роняет работающий — останется прежний.')),
			grid,
			E('div', { style: 'margin-top:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
				applyBtn
			]),
			applyNote
		]);
	},

	refreshProfiles: function() {
		if (!this.profilesBox) return;
		this.profilesBox.textContent = '';
		this.profilesBox.appendChild(this.buildProfilesCard());
	},

	/* ---------- адаптивный сторож ---------- */

	/* guardian.sh перечитывает UCI на каждом тике (read_config в tick) —
	   пишем напрямую в секцию antidpi, без рестарта */
	saveGuardianOpt: function(field, value) {
		try {
			uci.set('morok', 'antidpi', field, String(value));
		} catch (e) {
			fn.notify(fn._t('не удалось записать настройку'));
			return;
		}
		uci.save().then(function() {
			return L.resolveDefault(uciCommit('morok'), null);
		}).then(function(res) {
			if (res === null)
				fn.notify(fn._t('настройка сохранена локально, но commit недоступен'));
			else
				fn.notify(fn._t('Сторож: настройка сохранена — вступит в силу на следующей проверке'));
		});
	},

	guardianOpt: function(field, dflt) {
		var v = null;
		try { v = uci.get('morok', 'antidpi', field); } catch (e) {}
		return (v != null && v !== '') ? parseInt(v, 10) : dflt;
	},

	guardianSeg: function(field, current, pairs) {
		var self = this;
		var seg = E('div', { 'class': 'fn-seg' });
		pairs.forEach(function(p) {
			var btn = E('button', {
				'class': current === p[0] ? 'on' : '',
				click: function() {
					seg.querySelectorAll('button').forEach(function(b) { b.classList.remove('on'); });
					this.classList.add('on');
					self.saveGuardianOpt(field, p[0]);
				}
			}, p[1]);
			seg.appendChild(btn);
		});
		return seg;
	},

	buildGuardianCard: function() {
		var d = this.data;
		var g = (d && d.guardian) || { mode: 'off', state_text: '' };
		var failThr = this.guardianOpt('fail_threshold', 3);
		var checkInt = this.guardianOpt('check_interval', 300);
		var rescanInt = this.guardianOpt('rescan_interval', 21600);

		/* человеческое объяснение «что будет, если профиль перестанет работать» */
		var explain;
		if (g.mode === 'off')
			explain = fn._t('Сейчас сторожу нечего охранять: нет включённых правил с действием «Оптимизация» и флажком «адаптивное». Включите такое правило на странице «Маршрутизация» — и сторож начнёт следить.');
		else if (g.mode === 'proxy' || g.mode === 'mixed')
			explain = fn._t('Прямой путь сейчас не отвечает, поэтому сторож ВРЕМЕННО пустил трафик через VPN — всё продолжает работать. Он периодически проверяет прямой путь и сам вернёт правило на оптимизацию, когда доставка восстановится.');
		else
			explain = fn._t('Если профиль перестанет работать, сторож это заметит и ВРЕМЕННО переведёт трафик правила через VPN — сервисы продолжат открываться. Когда прямой путь оживёт, сторож сам вернёт правило на оптимизацию.');

		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-title' }, [
				fn._t('Адаптивный сторож '),
				E('span', { 'class': 'fn-badge violet' }, 'guardian')
			]),
			E('div', { 'class': 'fn-card-sub' }, explain),
			E('div', { style: 'margin-top:6px' } , [
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, fn._t('Считать профиль сломанным после')),
						E('div', { 'class': 'fn-opt-desc' }, fn._t('подряд неудачных проверок — потом правило уйдёт в VPN'))
					]),
					this.guardianSeg('fail_threshold', failThr, [ [ 2, '2' ], [ 3, '3' ], [ 5, '5' ] ])
				]),
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, fn._t('Проверять прямой путь каждые')),
						E('div', { 'class': 'fn-opt-desc' }, fn._t('как часто сторож делает контрольный запрос'))
					]),
					this.guardianSeg('check_interval', checkInt,
						[ [ 60, fn._t('1 мин') ], [ 300, fn._t('5 мин') ], [ 600, fn._t('10 мин') ] ])
				]),
				E('div', { 'class': 'fn-opt' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, fn._t('Пытаться вернуть на оптимизацию каждые')),
						E('div', { 'class': 'fn-opt-desc' }, fn._t('пока правило в VPN, сторож изредка пробует прямой путь'))
					]),
					this.guardianSeg('rescan_interval', rescanInt,
						[ [ 3600, fn._t('1 ч') ], [ 21600, fn._t('6 ч') ], [ 86400, fn._t('сутки') ] ])
				])
			]),
			E('div', { 'class': 'fn-card-sub', style: 'margin-top:10px;opacity:.75' },
				fn._t('Флажок «адаптивное» включается у каждого правила на странице «Маршрутизация». Настройки сторож подхватывает сам, перезапуск не нужен.'))
		]);
	},

	/* ---------- правила, использующие оптимизацию ---------- */
	buildRulesCard: function() {
		var used = (this.rules || []).filter(function(r) {
			return r.action === 'antidpi';
		});
		var rows = E('div', { style: 'margin-top:10px' });
		if (!used.length) {
			rows.appendChild(E('div', { 'class': 'fn-card-sub' },
				fn._t('Пока ни одно правило не использует оптимизацию — движок простаивает. Добавьте правило с действием «Оптимизация» в Маршрутизации или установите пресет из Маркета.')));
		} else {
			used.forEach(function(r) {
				var adaptive = null;
				try { adaptive = uci.get('morok', r.id, 'adaptive'); } catch (e) {}
				rows.appendChild(E('div', { 'class': 'fn-rowitem' + (r.enabled ? '' : ' off'), style: 'padding:9px 4px' }, [
					E('span', { 'class': 'fn-dot ' + (r.enabled ? 'g' : 'dim') }),
					E('div', { style: 'flex:1;min-width:0' }, [
						E('div', { 'class': 'fn-rowname' }, [
							r.label || r.id,
							adaptive === '1' ? E('span', { 'class': 'fn-badge violet' }, fn._t('адаптивное')) : '',
							r.enabled ? '' : E('span', { 'class': 'fn-pill dim' }, fn._t('выключено'))
						])
					]),
					fn.actBadge('antidpi', adaptive === '1')
				]));
			});
		}
		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-spread' }, [
				E('div', [
					E('div', { 'class': 'fn-card-title' }, fn._t('Какие правила используют оптимизацию')),
					E('div', { 'class': 'fn-card-sub' },
						fn._t('Оптимизация применяется только к трафику этих правил — остальное идёт как настроено в маршрутизации.'))
				]),
				E('a', { 'class': 'fn-btn sm', href: L.url('admin/services/morok/routing') },
					fn._t('🧭 Открыть Маршрутизацию'))
			]),
			rows
		]);
	},

	/* ---------- проверка домена ---------- */
	renderTest: function() {
		var self = this;
		var input = E('input', {
			placeholder: 'youtube.com',
			style: 'min-width:220px;flex:1'
		});
		var resultBox = E('div');
		var btn = E('button', { 'class': 'fn-btn' }, fn._t('🔬 Проверить'));
		btn.addEventListener('click', function() {
			var dom = String(input.value || '').trim().toLowerCase();
			if (!dom) { fn.notify(fn._t('Введите домен')); return; }
			btn.disabled = true;
			btn.textContent = fn._t('Проверяю…');
			resultBox.textContent = '';
			fn.call.testAntidpi(dom).then(function(res) {
				btn.disabled = false;
				btn.textContent = fn._t('🔬 Проверить');
				if (!res) {
					fn.notify(fn._t('метод test_antidpi недоступен'));
					return;
				}
				var ok = res.ok !== false && res.code && res.code !== '000';
				var cls = ok ? 'ok' : 'bad';
				var title = ok
					? fn._t('✓ Доставка есть! Оптимизация работает')
					: fn._t('✗ Доставки нет — попробуйте другой профиль');
				if (res.ok === false && !res.code) title = fn._t('✗ Проверка не удалась');
				var metaParts = [];
				if (res.ip) metaParts.push('IP ' + res.ip);
				if (res.code) metaParts.push('HTTP ' + res.code);
				if (res.time_ms != null && res.code && res.code !== '000') metaParts.push(res.time_ms + fn._t(' мс'));
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
				btn.textContent = fn._t('🔬 Проверить');
				fn.notify(fn._t('метод test_antidpi недоступен'));
			});
		});
		input.addEventListener('keydown', function(ev) {
			if (ev.key === 'Enter') btn.click();
		});

		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-title' }, fn._t('Проверка доставки')),
			E('div', { 'class': 'fn-card-sub' },
				fn._t('Быстрая проверка одного домена: резолв через туннель (системный DNS может быть недостоверен), затем запрос НАПРЯМУЮ — через движок, если он жив.')),
			E('div', { style: 'display:flex;gap:10px;margin-top:12px;flex-wrap:wrap' }, [
				input, btn
			]),
			resultBox
		]);
	},

	/* ---------- хостлист ---------- */
	renderHostlist: function() {
		var hl = (this.data && this.data.hostlist) || [];
		var tags = E('div', { 'class': 'fn-hostlist-tags' });
		hl.forEach(function(d) {
			tags.appendChild(E('span', { 'class': 'fn-badge' }, d));
		});
		if (!hl.length)
			tags.appendChild(E('div', { 'class': 'fn-card-sub' }, fn._t('пусто — движок работает без hostlist-фильтра или не запущен')));

		var det = E('details', { 'class': 'fn-hostlist', style: 'margin-top:12px' }, [
			E('summary', {}, fn._t('Домены в хостлисте (%s)', hl.length)),
			tags
		]);

		return E('div', { 'class': 'fn-card fn-mt' }, [
			E('div', { 'class': 'fn-card-title' }, fn._t('Хостлист оптимизации')),
			E('div', { 'class': 'fn-card-sub' },
				fn._t('Собирается автоматически из включённых правил с действием «Оптимизация» плюс сиды профиля. Только чтение — меняется через правила, а не руками.')),
			det
		]);
	},

	refresh: function() {
		var root = E('div');
		this.statusBox = E('div');
		this.statusBox.appendChild(this.buildStatusCard());
		this.profilesBox = E('div');
		this.profilesBox.appendChild(this.buildProfilesCard());
		this.scanBox = E('div');
		this.scanBox.appendChild(this.buildScanCard());
		root.appendChild(this.statusBox);
		root.appendChild(this.profilesBox);
		root.appendChild(this.scanBox);
		root.appendChild(this.buildGuardianCard());
		root.appendChild(this.buildRulesCard());
		root.appendChild(this.renderTest());
		root.appendChild(this.renderHostlist());
		this.mainBox.textContent = '';
		this.mainBox.appendChild(root);
	},

	render: function(data) {
		fn.loadCSS();
		this.data = data[0];
		this.rules = (data[1] && Array.isArray(data[1].rules)) ? data[1].rules : [];
		if (!this.data) {
			return fn.page('antidpi', E('div', [
				fn.unavailCard(fn._t('Оптимизация (get_antidpi)'))
			]));
		}
		this.sel = this.data.strategy || 'youtube';
		this.custom = this.data.strategy_custom || '';
		this.mainBox = E('div');
		this.refresh();
		/* если прогон уже идёт (запущен раньше) — подхватываем опрос;
		   последний завершённый результат хранится в scan_state.json и
		   тоже показывается (вердикты на карточках, свёрнутая таблица) */
		var self = this;
		L.resolveDefault(fn.call.scanStatus(), null).then(function(st) {
			if (!st) return;
			self.scan = st;
			self.scanFresh = false;
			self.renderScanBody();
			self.refreshProfiles();
			if (st.running === true) self.pollScan();
		});
		return fn.page('antidpi', this.mainBox);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
