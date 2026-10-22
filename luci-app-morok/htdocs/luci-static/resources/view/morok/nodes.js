'use strict';
'require view';
'require ui';
'require morok.common as fn';

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fn.call.nodes(), { nodes: [], subscriptions: [] }),
			L.resolveDefault(fn.call.status(), {})
		]);
	},

	/* ---------- модалка: добавить ноду ---------- */
	showAddNode: function() {
		var ta = E('textarea', {
			rows: 6,
			style: 'width:100%;font-family:monospace;font-size:12px;resize:vertical',
			placeholder: 'Вставь одну или несколько ссылок — по одной на строку:\nvless://...\nvmess://...\ntrojan://...\nss://...\nhy2://...\ntuic://...'
		});
		var preview = E('div', { style: 'margin-top:12px;max-height:220px;overflow-y:auto' });
		var parsed = [];

		ta.addEventListener('input', function() {
			parsed = [];
			preview.textContent = '';
			var lines = ta.value.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l !== ''; });
			lines.forEach(function(l) {
				var r = fn.parseShareLink(l);
				if (r && r.outbound) {
					parsed.push(r);
					preview.appendChild(E('div', { 'class': 'fn-rowitem' }, [
						E('span', { 'class': 'fn-dot g' }),
						E('div', { style: 'flex:1;min-width:0' }, [
							E('div', { 'class': 'fn-rowname' }, fn.labelParts(r.meta.label)),
							E('div', { 'class': 'fn-rowsub' }, r.meta.type + ' · ' + r.meta.server + ':' + r.meta.port)
						]),
						E('span', { 'class': 'fn-badge' }, r.meta.type.toUpperCase())
					]));
				} else if (r && r.error) {
					preview.appendChild(E('div', { 'class': 'fn-rowitem' }, [
						E('span', { 'class': 'fn-dot r' }),
						E('div', { 'class': 'fn-rowsub' }, r.error + ' — ' + l.slice(0, 42) + '…')
					]));
				}
			});
		});

		var saveBtn = E('button', { 'class': 'fn-btn primary' }, 'Добавить');
		saveBtn.addEventListener('click', function() {
			if (parsed.length === 0) {
				fn.notify('Нет ни одной валидной ссылки');
				return;
			}
			saveBtn.disabled = true;
			saveBtn.textContent = 'Сохраняю…';
			var chain = Promise.resolve();
			var okCount = 0, failCount = 0;
			parsed.forEach(function(r) {
				chain = chain.then(function() {
					return fn.call.addNode(r.meta.label, JSON.stringify(r.outbound), 'Manual').then(function(res) {
						if (res && res.ok) okCount++; else failCount++;
					});
				});
			});
			chain.then(function() {
				ui.hideModal();
				fn.notify('Добавлено: ' + okCount + (failCount ? ', ошибок: ' + failCount : ''));
				setTimeout(function() { location.reload(); }, 900);
			})['catch'](function(e) {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Добавить';
				fn.notify('Ошибка: ' + (e && e.message ? e.message : e));
			});
		});

		ui.showModal('Добавить ноду из ссылки', [
			E('div', { 'class': 'fn-card-sub', style: 'margin-bottom:10px' },
				'Ссылки вида vless:// vmess:// trojan:// ss:// hy2:// tuic:// — разберутся автоматически, можно пачкой.'),
			ta,
			preview,
			E('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
				E('button', { 'class': 'fn-btn', click: ui.hideModal }, 'Отмена'),
				saveBtn
			])
		]);
	},

	/* ---------- модалка: добавить AmneziaWG-ноду (Wave 3, трек C) ----------
	   Поля по контракту UCI type=awg; raw = JSON описания (не sing-box outbound).
	   При status.awg_available=false — плашка и отключение сохранения:
	   сервер всё равно откажет («не установлены kmod-amneziawg/amneziawg-tools»). */
	showAddAwg: function(awgAvailable) {
		function field(label, input, hint) {
			return E('div', [
				E('div', { 'class': 'fn-opt-desc', style: 'margin-bottom:4px' }, label),
				input,
				hint ? E('div', { 'class': 'fn-opt-desc', style: 'opacity:.7;margin-top:3px' }, hint) : ''
			]);
		}
		function inp(ph, type) {
			return E('input', { type: type || 'text', placeholder: ph, style: 'width:100%' });
		}

		var labelI    = inp('Название — например: AWG дом');
		var endpointI = inp('Endpoint — host:port, например 203.0.113.10:51820');
		var privI     = inp('Private key (обязательно)');
		var addrI     = inp('Адреса интерфейса, CIDR через запятую: 10.8.0.2/32');
		var pubI      = inp('Public key пира (обязательно)');
		var pskI      = inp('Preshared key (необязательно)');
		var jcI       = inp('jc', 'number'), jminI = inp('jmin', 'number'), jmaxI = inp('jmax', 'number');
		var s1I = inp('s1', 'number'), s2I = inp('s2', 'number'),
		    s3I = inp('s3', 'number'), s4I = inp('s4', 'number');
		var h1I = inp('h1', 'number'), h2I = inp('h2', 'number'),
		    h3I = inp('h3', 'number'), h4I = inp('h4', 'number');
		var mtuI  = inp('MTU (необязательно, например 1420)', 'number');
		var keepI = inp('Keepalive, сек (необязательно, например 25)', 'number');

		var saveBtn = E('button', { 'class': 'fn-btn primary' }, 'Добавить');

		var kids = [];
		if (!awgAvailable) {
			kids.push(E('div', { 'class': 'fn-rowitem', style: 'border:none;padding:8px 0' }, [
				E('span', { 'class': 'fn-dot r' }),
				E('div', [
					E('div', { 'class': 'fn-rowname' }, 'kmod-amneziawg не установлен'),
					E('div', { 'class': 'fn-card-sub' },
						'На роутере нет пакетов kmod-amneziawg и amneziawg-tools — AmneziaWG-нода сейчас не заведётся: ' +
						'backend откажет при сохранении. Установи: opkg install kmod-amneziawg amneziawg-tools')
				])
			]));
			saveBtn.disabled = true;
		} else {
			kids.push(E('div', { 'class': 'fn-card-sub', style: 'margin-bottom:10px' },
				'AmneziaWG = WireGuard с обфускацией заголовков (junk-параметры). Возьми значения из конфига Amnezia — jc/jmin/jmax/s1–s4/h1–h4 должны совпадать с сервером.'));
		}

		saveBtn.addEventListener('click', function() {
			var label = labelI.value.trim();
			var endpoint = endpointI.value.trim();
			var priv = privI.value.trim();
			var pub = pubI.value.trim();
			var addrs = addrI.value.split(',').map(function(s) { return s.trim(); })
				.filter(function(s) { return s !== ''; });
			if (!label || !endpoint || !priv || !pub || addrs.length === 0) {
				fn.notify('Обязательные: название, endpoint (host:port), private key, адреса (CIDR), public key пира');
				return;
			}
			if (!/^\S+:\d{1,5}$/.test(endpoint)) {
				fn.notify('Endpoint должен быть вида host:port');
				return;
			}
			var raw = {
				type: 'awg',
				endpoint: endpoint,
				private_key: priv,
				address: addrs,
				peer_public_key: pub
			};
			function num(input, key) {
				var v = input.value.trim();
				if (v === '') return true;
				var n = parseInt(v, 10);
				if (isNaN(n) || n < 0) { fn.notify('Поле ' + key + ': нужно неотрицательное число'); return false; }
				raw[key] = n;
				return true;
			}
			var pairs = [ [ jcI, 'jc' ], [ jminI, 'jmin' ], [ jmaxI, 'jmax' ],
				[ s1I, 's1' ], [ s2I, 's2' ], [ s3I, 's3' ], [ s4I, 's4' ],
				[ h1I, 'h1' ], [ h2I, 'h2' ], [ h3I, 'h3' ], [ h4I, 'h4' ],
				[ mtuI, 'mtu' ], [ keepI, 'keepalive' ] ];
			for (var i = 0; i < pairs.length; i++)
				if (!num(pairs[i][0], pairs[i][1])) return;
			if (pskI.value.trim() !== '') raw.preshared_key = pskI.value.trim();

			saveBtn.disabled = true;
			saveBtn.textContent = 'Сохраняю…';
			fn.call.addNode(label, JSON.stringify(raw), 'Manual').then(function(res) {
				if (res && res.ok === false) {
					saveBtn.disabled = false;
					saveBtn.textContent = 'Добавить';
					fn.notify(res.error || 'Нода не добавлена');
					return;
				}
				ui.hideModal();
				fn.notify('AmneziaWG-нода «' + label + '» добавлена');
				setTimeout(function() { location.reload(); }, 900);
			})['catch'](function(e) {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Добавить';
				fn.notify('Ошибка: ' + (e && e.message ? e.message : e));
			});
		});

		kids.push(
			E('div', { style: 'display:flex;flex-direction:column;gap:10px' }, [
				field('Название', labelI),
				field('Endpoint (host:port)', endpointI),
				field('Private key', privI),
				field('Адреса интерфейса (CIDR, через запятую)', addrI),
				field('Public key пира', pubI),
				field('Preshared key', pskI)
			]),
			E('div', { 'class': 'fn-opt-desc', style: 'margin:10px 0 4px' },
				'Junk-параметры AmneziaWG (необязательно, но должны совпадать с сервером):'),
			E('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px' }, [
				jcI, jminI, jmaxI
			]),
			E('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px' }, [
				s1I, s2I, s3I, s4I
			]),
			E('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px' }, [
				h1I, h2I, h3I, h4I
			]),
			E('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px' }, [
				mtuI, keepI
			]),
			E('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
				E('button', { 'class': 'fn-btn', click: ui.hideModal }, 'Отмена'),
				saveBtn
			])
		);

		ui.showModal('Добавить AmneziaWG-ноду', kids);
	},

	/* ---------- модалка: добавить подписку ---------- */
	showAddSub: function() {
		var nameInput = E('input', { placeholder: 'Название — например: HLVPN', style: 'width:100%' });
		var url1 = E('input', { placeholder: 'Основная ссылка на подписку', style: 'width:100%' });
		var url2 = E('input', { placeholder: 'Резервная ссылка (необязательно)', style: 'width:100%' });
		var uaSelect = E('select', { style: 'width:100%' }, [
			E('option', { value: 'sing-box' }, 'User-Agent: sing-box (стандарт)'),
			E('option', { value: 'v2rayN/9.99' }, 'User-Agent: v2rayN/9.99 (панели типа Happ)'),
			E('option', { value: 'v2rayNG/1.8.29' }, 'User-Agent: v2rayNG'),
			E('option', { value: 'Happ/1.0' }, 'User-Agent: Happ'),
			E('option', { value: 'clash-verge/v2.0.3' }, 'User-Agent: Clash Verge')
		]);
		var hwidChk = E('input', { type: 'checkbox' });
		var hwidWrap = E('label', { 'class': 'fn-tgl' }, [ hwidChk, E('span', { 'class': 'tk' }) ]);

		var saveBtn = E('button', { 'class': 'fn-btn primary' }, 'Добавить и скачать');
		saveBtn.addEventListener('click', function() {
			var urls = [ url1.value.trim(), url2.value.trim() ].filter(function(u) { return u !== ''; });
			if (!nameInput.value.trim() || urls.length === 0) {
				fn.notify('Нужны название и хотя бы одна ссылка');
				return;
			}
			saveBtn.disabled = true;
			saveBtn.textContent = 'Скачиваю…';
			fn.call.addSubscription(nameInput.value.trim(), urls, 21600, uaSelect.value, hwidChk.checked).then(function(res) {
				ui.hideModal();
				if (res && res.ok) {
					fn.notify('Подписка добавлена — ноды скачиваются…');
					setTimeout(function() { location.reload(); }, 4000);
				} else {
					saveBtn.disabled = false;
					saveBtn.textContent = 'Добавить и скачать';
					fn.notify((res && res.error) || 'Ошибка добавления');
				}
			})['catch'](function(e) {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Добавить и скачать';
				fn.notify('Ошибка: ' + (e && e.message ? e.message : e));
			});
		});

		ui.showModal('Новая подписка', [
			E('div', { 'class': 'fn-card-sub', style: 'margin-bottom:10px' },
				'Если основную ссылку забанят — обновление само уйдёт на резервную. Если лягут обе — скачает через работающий туннель.'),
			E('div', { style: 'display:flex;flex-direction:column;gap:10px' }, [
				nameInput, url1, url2, uaSelect,
				E('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px' }, [
					E('div', [
						E('div', { 'class': 'fn-opt-name' }, 'HWID-заголовки'),
						E('div', { 'class': 'fn-opt-desc' }, 'включи, если панель отдаёт заглушку «приложение не поддерживается» (Happ-панели)')
					]),
					hwidWrap
				])
			]),
			E('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
				E('button', { 'class': 'fn-btn', click: ui.hideModal }, 'Отмена'),
				saveBtn
			])
		]);
	},

	/* ---------- модалка: настройки подписки (Wave 2, задача 2.4) ---------- */
	showSubSettings: function(s) {
		var nameInput = E('input', { value: s.label || '', style: 'width:100%' });
		var intervalInput = E('input', {
			type: 'number', min: '1', max: '720',
			value: String(Math.max(1, Math.round((s.update_interval || 21600) / 3600))),
			style: 'width:100%'
		});
		var uaSelect = E('select', { style: 'width:100%' }, [
			E('option', { value: 'sing-box' }, 'User-Agent: sing-box (стандарт)'),
			E('option', { value: 'v2rayN/9.99' }, 'User-Agent: v2rayN/9.99 (панели типа Happ)'),
			E('option', { value: 'v2rayNG/1.8.29' }, 'User-Agent: v2rayNG'),
			E('option', { value: 'Happ/1.0' }, 'User-Agent: Happ'),
			E('option', { value: 'clash-verge/v2.0.3' }, 'User-Agent: Clash Verge')
		]);
		if (s.user_agent) {
			var found = false;
			Array.prototype.forEach.call(uaSelect.options, function(o) {
				if (o.value === s.user_agent) found = true;
			});
			if (!found)
				uaSelect.appendChild(E('option', { value: s.user_agent }, 'User-Agent: ' + s.user_agent));
			uaSelect.value = s.user_agent;
		}
		var enChk = E('input', { type: 'checkbox' });
		enChk.checked = s.enabled !== false && s.enabled !== '0' && s.enabled !== 0;
		var hwidChk = E('input', { type: 'checkbox' });
		hwidChk.checked = s.hwid === true || s.hwid === '1' || s.hwid === 1;

		var saveBtn = E('button', { 'class': 'fn-btn primary' }, 'Сохранить');
		saveBtn.addEventListener('click', function() {
			var hours = parseInt(intervalInput.value, 10);
			if (!nameInput.value.trim() || !(hours >= 1 && hours <= 720)) {
				fn.notify('Название непустое, интервал — от 1 до 720 часов');
				return;
			}
			saveBtn.disabled = true;
			saveBtn.textContent = 'Сохраняю…';
			fn.call.setSubscription(s.id, nameInput.value.trim(), enChk.checked,
				hours * 3600, uaSelect.value, hwidChk.checked).then(function(res) {
				if (res && res.ok === false) {
					saveBtn.disabled = false;
					saveBtn.textContent = 'Сохранить';
					fn.notify(res.error || 'Не удалось сохранить подписку');
					return;
				}
				ui.hideModal();
				fn.notify('Подписка «' + nameInput.value.trim() + '» сохранена');
				setTimeout(function() { location.reload(); }, 900);
			})['catch'](function() {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Сохранить';
				fn.notify('Метод set_subscription пока недоступен');
			});
		});

		function field(label, input) {
			return E('div', [
				E('div', { 'class': 'fn-opt-desc', style: 'margin-bottom:4px' }, label),
				input
			]);
		}
		function switchRow(name, desc, chk) {
			return E('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px' }, [
				E('div', [
					E('div', { 'class': 'fn-opt-name' }, name),
					E('div', { 'class': 'fn-opt-desc' }, desc)
				]),
				E('label', { 'class': 'fn-tgl' }, [ chk, E('span', { 'class': 'tk' }) ])
			]);
		}

		ui.showModal('Подписка: ' + (s.label || s.id), [
			E('div', { 'class': 'fn-card-sub', style: 'margin-bottom:10px' },
				'Расписание автообновления, заголовки для панели и выключение без удаления.'),
			E('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
				field('Название', nameInput),
				field('Интервал обновления, часов', intervalInput),
				field('User-Agent для панели', uaSelect),
				switchRow('Подписка включена', 'выключенная подписка не обновляется по расписанию', enChk),
				switchRow('HWID-заголовки', 'нужны Happ-подобным панелям, иначе отдают заглушку', hwidChk)
			]),
			E('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
				E('button', { 'class': 'fn-btn', click: ui.hideModal }, 'Отмена'),
				saveBtn
			])
		]);
	},

	/* ---------- модалка: редактировать ручную ноду (Wave 1, задача 1.3) ---------- */
	showEditNode: function(n) {
		var labelInput = E('input', { value: n.label || '', style: 'width:100%' });
		var serverInput = E('input', { value: n.server || '', style: 'width:100%' });
		var portInput = E('input', { value: String(n.port || ''), type: 'number', min: '1', max: '65535', style: 'width:100%' });

		var saveBtn = E('button', { 'class': 'fn-btn primary' }, 'Сохранить');
		saveBtn.addEventListener('click', function() {
			var port = parseInt(portInput.value, 10);
			if (!labelInput.value.trim() || !serverInput.value.trim() || !(port > 0 && port <= 65535)) {
				fn.notify('Заполни название, сервер и порт (1–65535)');
				return;
			}
			saveBtn.disabled = true;
			saveBtn.textContent = 'Сохраняю…';
			fn.call.updateNode(n.id, labelInput.value.trim(), serverInput.value.trim(), port).then(function(res) {
				if (res && res.ok === false) {
					saveBtn.disabled = false;
					saveBtn.textContent = 'Сохранить';
					fn.notify(res.error || 'Не удалось сохранить ноду');
					return;
				}
				ui.hideModal();
				fn.notify('Нода обновлена');
				setTimeout(function() { location.reload(); }, 900);
			})['catch'](function() {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Сохранить';
				fn.notify('Метод update_node пока недоступен');
			});
		});

		function field(label, input) {
			return E('div', [
				E('div', { 'class': 'fn-opt-desc', style: 'margin-bottom:4px' }, label),
				input
			]);
		}

		ui.showModal('Редактировать ноду', [
			E('div', { 'class': 'fn-card-sub', style: 'margin-bottom:10px' },
				'Меняются только название и адрес — протокол и ключи остаются как в исходной ссылке. Править можно только ручные ноды.'),
			E('div', { style: 'display:flex;flex-direction:column;gap:10px' }, [
				field('Название', labelInput),
				field('Сервер (host)', serverInput),
				field('Порт', portInput)
			]),
			E('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
				E('button', { 'class': 'fn-btn', click: ui.hideModal }, 'Отмена'),
				saveBtn
			])
		]);
	},

	/* ---------- обновление метрик нод без перезагрузки ---------- */
	updateMetrics: function(list) {
		var map = {};
		(list || []).forEach(function(n) { if (n && n.id) map[n.id] = n; });
		document.querySelectorAll('.fn-metrics-slot').forEach(function(slot) {
			var n = map[slot.dataset.nodeId];
			if (!n) return;
			slot.textContent = '';
			slot.appendChild(fn.metricCell(n));
		});
	},

	markChecking: function() {
		document.querySelectorAll('.fn-metrics-slot').forEach(function(slot) {
			slot.textContent = '';
			slot.appendChild(E('span', { 'class': 'fn-metric checking' }, [
				E('span', { 'class': 'fn-spin' }),
				E('span', { 'class': 'm-val' }, 'проверяется…')
			]));
		});
	},

	/* «Проверить все»: test_nodes запускает параллельную проверку;
	   пока она идёт — раз в 3 с подтягиваем последние измерения из nodes,
	   по завершении — финальный nodes для синхронизации. */
	testAll: function(pingBtn) {
		var self = this;
		// под xray нет Clash API — test_nodes бессмысленен (W3_NOTES_C)
		if (this.engine === 'xray') {
			fn.notify('Проверка нод недоступна под ядром xray — у него нет Clash API');
			return;
		}
		pingBtn.disabled = true;
		pingBtn.textContent = '';
		pingBtn.appendChild(E('span', { 'class': 'fn-spin' }));
		pingBtn.appendChild(document.createTextNode(' Проверяем…'));
		this.markChecking();

		var poller = setInterval(function() {
			L.resolveDefault(fn.call.nodes(), null).then(function(res) {
				if (res && Array.isArray(res.nodes)) self.updateMetrics(res.nodes);
			});
		}, 3000);

		function done(msg) {
			clearInterval(poller);
			L.resolveDefault(fn.call.nodes(), null).then(function(res) {
				if (res && Array.isArray(res.nodes)) self.updateMetrics(res.nodes);
				pingBtn.disabled = false;
				pingBtn.textContent = 'Проверить все';
				if (msg) fn.notify(msg);
			});
		}

		L.resolveDefault(fn.call.testNodes(), null).then(function(res) {
			if (res === null) { done('Метод test_nodes недоступен'); return; }
			if (res && Array.isArray(res.results)) self.updateMetrics(res.results);
			if (res && res.ok === false) { done(res.error || 'sing-box не запущен — проверка невозможна'); return; }
			done('Проверка завершена');
		});
	},

	/* ---------- строка ноды ---------- */
	nodeRow: function(n, activeId) {
		var self = this;
		// ручную ноду можно править: origin=manual (когда бэк начнёт его отдавать)
		// или группа Manual — туда add_node складывает ручные ноды сейчас
		var isManual = n.origin === 'manual' || (!n.origin && n.group === 'Manual');
		// xhttp-транспорт — Xray-only (W3_NOTES_C): помечаем, под sing-box нода пропускается
		var xhttp = false;
		if (n.raw) {
			try {
				var raw = (typeof n.raw === 'string') ? JSON.parse(n.raw) : n.raw;
				xhttp = !!(raw && raw.transport && raw.transport.type === 'xhttp');
			} catch (e) {}
		}
		var underXray = this.engine === 'xray';
		var actions = [
			fn.typeBadge(n),
			xhttp ? E('span', { 'class': 'fn-badge violet',
				title: 'Транспорт xhttp: нода работает только при ядре xray (Дашборд → Ядро туннеля)' }, 'xhttp') : '',
			underXray
				? E('span', { 'class': 'fn-pill dim', title: 'У xray нет Clash API — задержки нод не измеряются' }, 'пинг н/д')
				: E('div', { 'class': 'fn-metrics-slot', 'data-node-id': n.id }, [ fn.metricCell(n) ]),
			E('span', { title: 'Выключенные ноды не попадают в цепочку фоллбэка и не проксируют трафик',
				style: 'display:inline-flex' }, [
				fn.toggle(n.enabled, false, function(on) {
					fn.call.setNode(n.id, on).then(function() {
						row.classList.toggle('off', !on);
						fn.notify(n.label + ': ' + (on ? 'включена' : 'выключена — в цепочку не попадёт'));
					});
				})
			])
		];
		if (isManual)
			actions.push(E('button', {
				'class': 'fn-btn sm',
				title: 'Редактировать ноду',
				click: function() { self.showEditNode(n); }
			}, '✎'));
		actions.push(E('button', {
			'class': 'fn-btn sm',
			title: 'Удалить ноду',
			click: function() {
				if (!confirm('Удалить ноду «' + n.label + '»?')) return;
				fn.call.delNode(n.id).then(function() {
					fn.notify('Нода удалена');
					row.remove();
				});
			}
		}, '🗑'));
		var row = E('div', { 'class': 'fn-rowitem' + (n.enabled ? '' : ' off') }, [
			E('div', {
				'class': 'fn-radio' + (n.id === activeId ? ' sel' : ''),
				title: 'Сделать активной',
				click: function() {
					fn.call.selectNode(n.id).then(function(res) {
						if (res && res.ok === false) { fn.notify(res.error || 'Не удалось выбрать ноду'); return; }
						fn.notify('Активная нода: ' + n.label + ' (применяется…)');
						setTimeout(function() { location.reload(); }, 1500);
					});
				}
			}),
			E('div', { style: 'flex:1;min-width:0' }, [
				E('div', { 'class': 'fn-rowname' }, fn.labelParts(n.label)),
				E('div', { 'class': 'fn-rowsub' }, n.type + ' · ' + n.server + ':' + n.port)
			]),
			E('div', { style: 'margin-left:auto;display:flex;align-items:center;gap:12px;flex-shrink:0' }, actions)
		]);
		row.dataset.name = (n.label + ' ' + n.type + ' ' + n.server).toLowerCase();
		return row;
	},

	render: function(data) {
		fn.loadCSS();
		var self = this;
		var nodesData = data[0] || { nodes: [], subscriptions: [] };
		var st = data[1] || {};
		this.engine = st.engine || 'sing-box';
		this.awgAvailable = st.awg_available === true;
		var groups = {};
		(nodesData.nodes || []).forEach(function(n) {
			(groups[n.group] = groups[n.group] || []).push(n);
		});

		var root = E('div');

		// toolbar
		var search = E('input', { placeholder: 'Поиск по имени, протоколу, серверу…' });
		search.addEventListener('input', function() {
			var q = search.value.trim().toLowerCase();
			root.querySelectorAll('.fn-rowitem[data-name]').forEach(function(r) {
				r.style.display = (q && r.dataset.name.indexOf(q) === -1) ? 'none' : '';
			});
		});

		var pingBtn = E('button', { 'class': 'fn-btn' }, 'Проверить все');
		pingBtn.addEventListener('click', function() { self.testAll(pingBtn); });

		root.appendChild(E('div', { 'class': 'fn-toolbar' }, [
			E('div', { 'class': 'fn-search' }, search),
			pingBtn,
			E('button', { 'class': 'fn-btn', click: function() { self.showAddSub(); } }, '+ Подписка'),
			E('button', { 'class': 'fn-btn primary', click: function() { self.showAddNode(); } }, '+ Нода'),
			E('button', {
				'class': 'fn-btn',
				title: this.awgAvailable
					? 'Добавить AmneziaWG-ноду (WireGuard с обфускацией)'
					: 'На роутере нет kmod-amneziawg/amneziawg-tools — форма откроется, но сохранить не получится',
				click: function() { self.showAddAwg(self.awgAvailable); }
			}, '+ AmneziaWG')
		]));
		root.appendChild(E('div', { 'class': 'fn-card-sub', style: 'margin:-8px 4px 14px' },
			'Тумблер справа включает/выключает ноду: выключенные ноды не попадают в цепочку фоллбэка и не проксируют трафик. ' +
			(this.engine === 'xray'
				? 'Ядро xray: пинги нод и «Проверить все» недоступны (у xray нет Clash API). Ноды с пометкой xhttp работают только под этим ядром.'
				: 'Метрики: TCP — рукопожатие с сервером, URL — реальный запрос через ноду (главная), DNS — пока не поддерживается движком (всегда «—»).')));

		// группы нод
		fn.call.status().then(function(st) {
			var activeId = st.active_node;
			root.querySelectorAll('.fn-group[data-nodes]').forEach(function(g) { g.remove(); });

			function addGroup(gname, subObj, groupNodes) {
				var body = E('div', { 'class': 'fn-group-body' });
				(groupNodes || []).forEach(function(n) {
					body.appendChild(self.nodeRow(n, activeId));
				});
				if (subObj && groupNodes.length === 0)
					body.appendChild(E('div', { 'class': 'fn-rowitem' }, [
						E('span', { 'class': 'fn-dot y' }),
						E('div', { 'class': 'fn-rowsub' },
							'Нод не получено — либо ссылка мёртвая, либо панель отдаёт заглушку ' +
							'(проверь, что подписка открывается в браузере). Обновлено: ' +
							(subObj.last_update > 0 ? new Date(subObj.last_update * 1000).toLocaleString() : 'никогда'))
					]));

				var headChildren = [
					E('span', { 'class': 'fn-caret' }, '▾'),
					E('div', { style: 'flex:1;min-width:0' }, [
						E('div', { 'class': 'fn-card-title' }, [
							gname + ' ',
							E('span', { 'class': 'fn-badge' }, String(groupNodes.length))
						]),
						E('div', { 'class': 'fn-card-sub' },
							subObj
								? 'подписка · ' + (subObj.url || []).length + ' ссылки (основная + резерв) · обновлено ' +
									(subObj.last_update > 0 ? new Date(subObj.last_update * 1000).toLocaleString() : 'никогда')
								: 'ручные ноды')
					])
				];
				if (subObj) {
					var sid = subObj.id;
					var updBtn = E('button', {
						'class': 'fn-btn sm',
						click: function(ev) {
							ev.stopPropagation();
							updBtn.disabled = true;
							updBtn.textContent = 'Обновляю…';
							fn.call.updateSubscription(sid).then(function() {
								fn.notify('Подписка обновляется…');
								setTimeout(function() { location.reload(); }, 5000);
							});
						}
					}, '↻ Обновить');
					var setBtn = E('button', {
						'class': 'fn-btn sm',
						title: 'Настройки подписки: расписание, UA, HWID',
						click: function(ev) {
							ev.stopPropagation();
							self.showSubSettings(subObj);
						}
					}, '⚙');
					var delBtn = E('button', {
						'class': 'fn-btn sm',
						title: 'Удалить подписку и её ноды',
						click: function(ev) {
							ev.stopPropagation();
							if (!confirm('Удалить подписку «' + gname + '» вместе со всеми её нодами?')) return;
							fn.call.delSubscription(sid).then(function(res) {
								fn.notify('Подписка удалена' + (res && res.removed_nodes ? ' (' + res.removed_nodes + ' нод)' : ''));
								setTimeout(function() { location.reload(); }, 700);
							});
						}
					}, '🗑');
					headChildren.push(updBtn, setBtn, delBtn);
				}

				var group = E('div', { 'class': 'fn-group', 'data-nodes': '1' }, [
					E('div', { 'class': 'fn-group-head' }, headChildren),
					body
				]);
				// сворачивание с запоминанием
				var ckey = 'fn-grp-' + gname;
				try {
					if (localStorage.getItem(ckey) === '1') group.classList.add('collapsed');
				} catch (e) {}
				group.querySelector('.fn-group-head').addEventListener('click', function() {
					group.classList.toggle('collapsed');
					try { localStorage.setItem(ckey, group.classList.contains('collapsed') ? '1' : '0'); } catch (e) {}
				});
				root.appendChild(group);
			}

			// подписки — всегда, даже если нод 0 (иначе добавленная подписка «исчезает»)
			var byLabel = {};
			(nodesData.nodes || []).forEach(function(n) {
				(byLabel[n.group] = byLabel[n.group] || []).push(n);
			});
			var shownGroups = {};
			(nodesData.subscriptions || []).forEach(function(s) {
				shownGroups[s.label] = 1;
				addGroup(s.label, s, byLabel[s.label] || []);
			});
			// ручные/прочие группы
			Object.keys(byLabel).forEach(function(gname) {
				if (!shownGroups[gname]) addGroup(gname, null, byLabel[gname]);
			});

			if ((nodesData.nodes || []).length === 0 && (nodesData.subscriptions || []).length === 0)
				root.appendChild(E('div', { 'class': 'fn-card' }, [
					E('div', { 'class': 'fn-card-title' }, 'Нод пока нет'),
					E('div', { 'class': 'fn-card-sub' }, 'Добавь подписку или ноду по ссылке — кнопки выше.')
				]));
		});

		return fn.page('nodes', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
