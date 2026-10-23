'use strict';
'require baseclass';
'require rpc';

/* Общие хелперы Morok: загрузка CSS, ubus-декларации, DOM-строительство,
   парсер share-ссылок, флаги, навигация. */

var CSS_VER = '13';
var cssLoaded = false;

/* ---------- синхронизация акцента с темой DarkVibe (ТЗ §10) ----------
   Направление строго одно: тема DarkVibe — источник правды. Она печатает
   --accent/--on-accent в <head> сервер-сайд; отсюда мы их читаем и
   перекрашиваем морок. Отдельной настройки цвета в мороке нет.
   Темы нет (bootstrap/argon) — переменные не определены, морок живёт
   на дефолтах из morok.css, в консоли чисто. */
var accentApplied = false;

/* #rgb / #rrggbb → { h, s, l } (h 0..360, s/l 0..100); null если не hex */
function hexToHsl(hex) {
	var m = String(hex || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!m) return null;
	var h6 = m[1];
	if (h6.length === 3)
		h6 = h6.split('').map(function(ch) { return ch + ch; }).join('');
	var r = parseInt(h6.slice(0, 2), 16) / 255,
	    g = parseInt(h6.slice(2, 4), 16) / 255,
	    b = parseInt(h6.slice(4, 6), 16) / 255;
	var max = Math.max(r, g, b), min = Math.min(r, g, b);
	var h = 0, s = 0, l = (max + min) / 2;
	if (max !== min) {
		var d = max - min;
		s = (l > 0.5 ? d / (2 - max - min) : d / (max + min)) * 100;
		if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
	}
	return { h: h, s: s, l: l * 100 };
}

/* { h, s, l } → #rrggbb; hue крутится по кругу, s/l клампятся в [0,100] */
function hslToHex(h, s, l) {
	h = ((h % 360) + 360) % 360;
	s = Math.min(100, Math.max(0, s)) / 100;
	l = Math.min(100, Math.max(0, l)) / 100;
	var c = (1 - Math.abs(2 * l - 1)) * s;
	var x = c * (1 - Math.abs((h / 60) % 2 - 1));
	var m = l - c / 2, r = 0, g = 0, b = 0;
	if (h < 60)       { r = c; g = x; }
	else if (h < 120) { r = x; g = c; }
	else if (h < 180) { g = c; b = x; }
	else if (h < 240) { g = x; b = c; }
	else if (h < 300) { r = x; b = c; }
	else              { r = c; b = x; }
	function to255(v) {
		var s16 = Math.round((v + m) * 255).toString(16);
		return s16.length < 2 ? '0' + s16 : s16;
	}
	return '#' + to255(r) + to255(g) + to255(b);
}

/* Перекраска морока в акцент темы. --fn-accent = акцент темы как есть;
   --fn-accent2 = тот же цвет со сдвигом HSL (+14° hue, s−8, l+6; s клампим
   в [10,95], l — в [15,90], чтобы пара оставалась цветной и читаемой).
   Инлайн на document.documentElement перекрывает :root из morok.css —
   в т.ч. для модалок LuCI, они живут на уровне body, а инлайн <html>
   их покрывает (см. комментарий у :root в morok.css). */
function applyAccent() {
	if (accentApplied) return;
	var cs = getComputedStyle(document.documentElement);
	var accent = (cs.getPropertyValue('--accent') || '').trim();
	/* --on-accent читаем как сигнал «тема реально напечатала акцент»,
	   но воротами не считаем — достаточно валидного hex в --accent */
	var onAccent = (cs.getPropertyValue('--on-accent') || '').trim();
	var hsl = hexToHsl(accent);
	if (!hsl || !onAccent) return;
	var hsl2 = {
		h: hsl.h + 14,
		s: Math.min(95, Math.max(10, hsl.s - 8)),
		l: Math.min(90, Math.max(15, hsl.l + 6))
	};
	document.documentElement.style.setProperty('--fn-accent', accent);
	document.documentElement.style.setProperty('--fn-accent2', hslToHex(hsl2.h, hsl2.s, hsl2.l));
	accentApplied = true;
}

/* переменные темы печатаются сервером синхронно в <head> — к рендеру
   view-морока они уже на месте; подстраховываемся и на DOMContentLoaded.
   До loadCSS() вызов безвреден: setProperty не зависит от morok.css. */
if (document.readyState === 'loading')
	document.addEventListener('DOMContentLoaded', applyAccent);
else
	applyAccent();

function loadCSS() {
	if (cssLoaded) return;
	cssLoaded = true;
	var cssUrl = L.resource('morok/morok.css');
	cssUrl += (cssUrl.indexOf('?') < 0 ? '?' : '&') + 'v=' + CSS_VER;
	document.head.appendChild(E('link', { rel: 'stylesheet', href: cssUrl }));
	// даём CSS возможность перекрасить всю страницу и спрятать
	// стоковое таб-меню LuCI (мы рисуем свой сайдбар)
	document.body.classList.add('morok-page');
	// прячем стоковые табы напрямую — надёжно даже при закэшированном CSS
	document.querySelectorAll('.cbi-tabmenu, .cbi-tab-descr, #tabmenu, .tabs').forEach(function(el) {
		el.style.display = 'none';
	});
	// фича #10: перекрасить морок в акцент темы DarkVibe (если тема есть);
	// accentApplied-флаг делает повторные вызовы из DOMContentLoaded дешёвыми
	applyAccent();
}

/* Своя навигация вместо стоковых вкладок LuCI:
   левый сайдбар в дизайне Morok, с «Дашбордом» как домом. */
var NAV_ITEMS = [
	{ key: 'dashboard', path: 'admin/services/morok',          icon: '⚡', label: 'Дашборд' },
	{ key: 'nodes',     path: 'admin/services/morok/nodes',    icon: '🌐', label: 'Пул нод' },
	{ key: 'routing',   path: 'admin/services/morok/routing',  icon: '🧭', label: 'Маршрутизация' },
	{ key: 'market',    path: 'admin/services/morok/market',   icon: '🛒', label: 'Маркет' },
	{ key: 'devices',   path: 'admin/services/morok/devices',  icon: '📱', label: 'Устройства' },
	{ key: 'antidpi',   path: 'admin/services/morok/antidpi',  icon: '🛡', label: 'Оптимизация' },
	{ key: 'fallback',  path: 'admin/services/morok/fallback', icon: '🔀', label: 'Фоллбэк' },
	{ key: 'log',       path: 'admin/services/morok/log',      icon: '📜', label: 'Журнал' },
	{ key: 'diag',      path: 'admin/services/morok/diag',     icon: '🔬', label: 'Диагностика' },
	{ key: 'components', path: 'admin/services/morok/components', icon: '🧩', label: 'Компоненты' }
];

function nav(activeKey) {
	var links = NAV_ITEMS.map(function(it) {
		return E('a', {
			href: L.url(it.path),
			'class': it.key === activeKey ? 'on' : ''
		}, [ E('span', { 'class': 'fn-nav-ico' }, it.icon), it.label ]);
	});
	return E('nav', { 'class': 'fn-nav' }, [
		E('div', { 'class': 'fn-nav-logo' }, [ 'Мо', E('b', 'рок') ]),
		E('div', { 'class': 'fn-nav-links' }, links)
	]);
}

/* Обёртка страницы: сайдбар слева + контент справа */
function page(activeKey, mainEl) {
	return E('div', { 'class': 'morok fn-layout' }, [
		nav(activeKey),
		E('div', { 'class': 'fn-main' }, mainEl)
	]);
}

var call = {
	status:      rpc.declare({ object: 'morok', method: 'status' }),
	nodes:       rpc.declare({ object: 'morok', method: 'nodes' }),
	rules:       rpc.declare({ object: 'morok', method: 'rules' }),
	chain:       rpc.declare({ object: 'morok', method: 'chain' }),
	sources:     rpc.declare({ object: 'morok', method: 'sources' }),
	testNodes:   rpc.declare({ object: 'morok', method: 'test_nodes' }),
	setNode:     rpc.declare({ object: 'morok', method: 'set_node', params: [ 'id', 'enabled' ] }),
	selectNode:  rpc.declare({ object: 'morok', method: 'select_node', params: [ 'id' ] }),
	addNode:     rpc.declare({ object: 'morok', method: 'add_node', params: [ 'label', 'raw', 'group' ] }),
	delNode:     rpc.declare({ object: 'morok', method: 'del_node', params: [ 'id' ] }),
	addSubscription: rpc.declare({ object: 'morok', method: 'add_subscription',
		params: [ 'label', 'url', 'update_interval', 'user_agent', 'hwid' ] }),
	updateSubscription: rpc.declare({ object: 'morok', method: 'update_subscription', params: [ 'id' ] }),
	delSubscription: rpc.declare({ object: 'morok', method: 'del_subscription', params: [ 'id' ] }),
	setRule:     rpc.declare({ object: 'morok', method: 'set_rule', params: [ 'id', 'enabled' ] }),
	addRule:     rpc.declare({ object: 'morok', method: 'add_rule', params: [ 'label', 'match', 'action' ] }),
	delRule:     rpc.declare({ object: 'morok', method: 'del_rule', params: [ 'id' ] }),
	setFallback: rpc.declare({ object: 'morok', method: 'set_fallback',
		params: [ 'fail_threshold', 'kill_switch', 'auto_return', 'test_url' ] }),
	setGlobal:   rpc.declare({ object: 'morok', method: 'set_global', params: [ 'field', 'value' ] }),
	apply:       rpc.declare({ object: 'morok', method: 'apply' }),
	/* Wave 1: контракт §6 — методы реализует backend (трек C).
	   До их появления вызовы reject'ятся — страницы показывают «метод недоступен». */
	setChain:    rpc.declare({ object: 'morok', method: 'set_chain', params: [ 'chain' ] }),
	updateNode:  rpc.declare({ object: 'morok', method: 'update_node', params: [ 'id', 'label', 'server', 'port' ] }),
	devices:     rpc.declare({ object: 'morok', method: 'devices' }),
	setDevice:   rpc.declare({ object: 'morok', method: 'set_device', params: [ 'mac', 'route', 'label', 'enabled' ] }),
	delDevice:   rpc.declare({ object: 'morok', method: 'del_device', params: [ 'mac' ] }),
	setSource:   rpc.declare({ object: 'morok', method: 'set_source', params: [ 'id', 'enabled', 'url', 'update_interval' ] }),
	updateSource: rpc.declare({ object: 'morok', method: 'update_source', params: [ 'id' ] }),
	readLog:     rpc.declare({ object: 'morok', method: 'read_log', params: [ 'lines' ] }),
	guardianStatus: rpc.declare({ object: 'morok', method: 'guardian_status' }),
	/* Wave 2: контракт §6 — методы реализует backend (трек C).
	   До их появления вызовы reject'ятся — страницы деградируют мягко. */
	diagnose:    rpc.declare({ object: 'morok', method: 'diagnose' }),
	runFix:      rpc.declare({ object: 'morok', method: 'run_fix', params: [ 'id' ] }),
	backup:      rpc.declare({ object: 'morok', method: 'backup' }),
	restore:     rpc.declare({ object: 'morok', method: 'restore', params: [ 'json' ] }),
	components:  rpc.declare({ object: 'morok', method: 'components' }),
	updateComponent: rpc.declare({ object: 'morok', method: 'update_component', params: [ 'name' ] }),
	setSubscription: rpc.declare({ object: 'morok', method: 'set_subscription',
		params: [ 'id', 'label', 'enabled', 'update_interval', 'user_agent', 'hwid' ] }),
	checkDomain: rpc.declare({ object: 'morok', method: 'check_domain', params: [ 'domain' ] }),
	/* Track B3 / Wave 3-контракты: реализует backend (трек C) параллельно.
	   До их появления вызовы reject'ятся — страницы деградируют мягко. */
	reorderRules: rpc.declare({ object: 'morok', method: 'reorder_rules', params: [ 'order' ] }),
	renameRule:  rpc.declare({ object: 'morok', method: 'rename_rule', params: [ 'id', 'label' ] }),
	getDns:      rpc.declare({ object: 'morok', method: 'get_dns' }),
	setDns:      rpc.declare({ object: 'morok', method: 'set_dns', params: [ 'mode', 'upstream', 'hijack' ] }),
	checkUpdate: rpc.declare({ object: 'morok', method: 'check_update', params: [ 'name' ] }),
	rollback:    rpc.declare({ object: 'morok', method: 'rollback', params: [ 'name' ] }),
	diagnoseStep: rpc.declare({ object: 'morok', method: 'diagnose_step', params: [ 'id' ] }),
	/* Страница «Оптимизация»: ручной выбор профиля обработки пакетов + проверка */
	getAntidpi:  rpc.declare({ object: 'morok', method: 'get_antidpi' }),
	setAntidpi:  rpc.declare({ object: 'morok', method: 'set_antidpi', params: [ 'strategy', 'engine', 'strategy_custom' ] }),
	testAntidpi: rpc.declare({ object: 'morok', method: 'test_antidpi', params: [ 'domain' ] }),
	/* Сканер профилей доставки: батарея профилей zapret2 против доменов */
	scanStart:   rpc.declare({ object: 'morok', method: 'scan_start', params: [ 'domains' ] }),
	scanStatus:  rpc.declare({ object: 'morok', method: 'scan_status' }),
	scanApply:   rpc.declare({ object: 'morok', method: 'scan_apply', params: [ 'id' ] }),
	scanStop:    rpc.declare({ object: 'morok', method: 'scan_stop' }),
	/* Wave 3.5: метрики — отдельный rpcd-плагин morok_metrics */
	metricsRead:  rpc.declare({ object: 'morok_metrics', method: 'read' }),
	metricsReset: rpc.declare({ object: 'morok_metrics', method: 'reset' }),
	/* Wave 4: маркет пресетов + самообновление приложения (трек C).
	   add_source нужен маркету для создания источников пресета;
	   app_update может идти дольше rpctimeout — таймаут запроса
	   обрабатываем как «результат проверь обновлением страницы». */
	market:      rpc.declare({ object: 'morok', method: 'market' }),
	addSource:   rpc.declare({ object: 'morok', method: 'add_source',
		params: [ 'label', 'url', 'update_interval' ] }),
	appCheck:    rpc.declare({ object: 'morok', method: 'app_check' }),
	appUpdate:   rpc.declare({ object: 'morok', method: 'app_update' })
};

function toggle(checked, danger, onChange) {
	var input = E('input', { type: 'checkbox' });
	input.checked = !!checked;
	var wrap = E('label', { 'class': 'fn-tgl' + (danger ? ' danger' : '') }, [
		input, E('span', { 'class': 'tk' })
	]);
	input.addEventListener('change', function() { onChange(input.checked, input); });
	return wrap;
}

function pingPill(ping) {
	if (ping == null) return E('span', { 'class': 'fn-pill r' }, 'timeout');
	var cls = ping < 90 ? 'g' : ping < 180 ? 'y' : 'r';
	return E('span', { 'class': 'fn-pill ' + cls }, ping + ' ms');
}

/* Три метрики ноды (track B3: test_nodes/nodes отдают tcp_ms/url_ms/dns_ok).
   Таймауты — человечески («нет ответа»). Если backend отдаёт только
   старый ping — показываем его одним пилюлем (graceful degradation). */
function metricPill(cls, label, value, dead) {
	return E('span', { 'class': 'fn-metric ' + cls + (dead ? ' dead' : '') }, [
		E('span', { 'class': 'm-label' }, label),
		E('span', { 'class': 'm-val' }, value)
	]);
}

function metricCell(n) {
	n = n || {};
	var hasNew = n.tcp_ms != null || n.url_ms != null || n.dns_ok != null;
	if (!hasNew) return pingPill(n.ping);
	function ms(v) {
		if (v == null || v <= 0) return [ 'нет ответа', true ];
		return [ v + ' ms', false ];
	}
	var tcp = ms(n.tcp_ms), url = ms(n.url_ms);
	var dnsVal = n.dns_ok === true ? '✓' : n.dns_ok === false ? '✗' : '—';
	return E('div', { 'class': 'fn-metrics' }, [
		metricPill('tcp', 'TCP', tcp[0], tcp[1]),
		metricPill('url', 'URL', url[0], url[1]),
		metricPill('dns', 'DNS', dnsVal, n.dns_ok === false)
	]);
}

/* «N мин назад» для unix-timestamp (сек) */function agoText(ts) {
	if (!ts || ts <= 0) return 'никогда';
	var sec = Math.max(0, Math.floor(Date.now() / 1000) - ts);
	if (sec < 60) return 'только что';
	var min = Math.floor(sec / 60);
	if (min < 60) return min + ' мин назад';
	var h = Math.floor(min / 60);
	if (h < 24) return h + ' ч ' + (min % 60) + ' мин назад';
	return new Date(ts * 1000).toLocaleString();
}

/* скелетон-заглушки: страница не висит пустой, пока идёт ubus-запрос */
function skelRows(n) {
	var kids = [];
	for (var i = 0; i < n; i++)
		kids.push(E('div', { 'class': 'fn-skel-row' }, [
			E('span', { 'class': 'fn-skel dot' }),
			E('span', { 'class': 'fn-skel line', style: 'width:' + (55 - i * 7) + '%' }),
			E('span', { 'class': 'fn-skel chip' })
		]));
	return E('div', { 'class': 'fn-card', style: 'padding:8px 0' }, kids);
}

function actBadge(action, adaptiveProxy) {
	var map = {
		proxy:   [ '→ Прокси', 'proxy' ],
		direct:  [ '→ Напрямую', 'direct' ],
		block:   [ '✕ Блок', 'block' ],
		antidpi: [ '⚡ Оптимизация', 'antidpi' ]
	};
	if (adaptiveProxy) return E('span', { 'class': 'fn-act adaptive-proxy' }, '⚡→Прокси (авто)');
	var m = map[action] || map.proxy;
	return E('span', { 'class': 'fn-act ' + m[1] }, m[0]);
}

function typeBadge(node) {
	if (node.reality) return E('span', { 'class': 'fn-badge hl' }, 'Reality');
	return E('span', { 'class': 'fn-badge' }, String(node.type || '?').toUpperCase());
}

/* ---------- флаги ---------- */
/* Windows не рисует flag-эмодзи (regional indicators) — показывает буквы.
   Заменяем ведущий флаг-эмодзи в имени ноды на картинку с flagcdn;
   если картинка не загрузилась (офлайн/недоступность) — остаются буквы кода. */
function flagEmojiToCC(f) {
	if (!f || f.length < 2) return null;
	var a = f.charCodeAt(0), b = f.charCodeAt(1);
	if (a < 0xD83C || b < 0xDDE6 || b > 0xDDFF) return null;
	var lo = f.charCodeAt(f.length === 4 ? 3 : 1);
	// суррогатная пара: D83C DDE6..DDFF ×2
	if (f.length >= 4) {
		var l1 = f.charCodeAt(1), l2 = f.charCodeAt(3);
		if (l1 < 0xDDE6 || l1 > 0xDDFF || l2 < 0xDDE6 || l2 > 0xDDFF) return null;
		return String.fromCharCode(65 + l1 - 0xDDE6) + String.fromCharCode(65 + l2 - 0xDDE6);
	}
	return null;
}

function flagImg(cc) {
	return E('img', {
		'class': 'fn-flag',
		src: 'https://flagcdn.com/w40/' + cc.toLowerCase() + '.png',
		alt: cc,
		loading: 'lazy'
	});
}

/* Возвращает МАССИВ детей: [flag?, текст без флага].
   Использовать как: E('div', {}, fn.labelParts(name)) — третьим аргументом,
   не вкладывать в другой массив (GL-сборка E() вложенные массивы не разворачивает). */
function labelParts(label) {
	label = String(label || '');
	var m = label.match(/^\s*(\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF])\s*/);
	if (!m) return [ label ];
	var cc = flagEmojiToCC(m[1]);
	var rest = label.slice(m[0].length);
	if (!cc) return [ label ];
	return [ flagImg(cc), rest ];
}

/* ---------- парсер share-ссылок ---------- */
/* Возвращает { outbound, meta } | { error } | null.
   outbound — готовый sing-box outbound (храним verbatim в option raw). */
function splitQuery(q) {
	var o = {};
	(q || '').split('&').forEach(function(p) {
		if (!p) return;
		var i = p.indexOf('=');
		var k = i >= 0 ? p.slice(0, i) : p;
		var v = i >= 0 ? p.slice(i + 1) : '';
		try { o[decodeURIComponent(k)] = decodeURIComponent(v); }
		catch (e) { o[k] = v; }
	});
	return o;
}

function urlParts(link, proto) {
	var rest = link.slice(proto.length + 3);
	var name = '';
	var hi = rest.indexOf('#');
	if (hi >= 0) {
		try { name = decodeURIComponent(rest.slice(hi + 1)); } catch (e) { name = rest.slice(hi + 1); }
		rest = rest.slice(0, hi);
	}
	var qi = rest.indexOf('?');
	var query = {};
	if (qi >= 0) { query = splitQuery(rest.slice(qi + 1)); rest = rest.slice(0, qi); }
	var at = rest.lastIndexOf('@');
	var user = at >= 0 ? rest.slice(0, at) : '';
	var hostport = at >= 0 ? rest.slice(at + 1) : rest;
	try { user = decodeURIComponent(user); } catch (e) {}
	var hp = hostport.match(/^(\[[0-9a-fA-F:.]+\]|[^:]*):?(\d*)$/);
	return {
		user: user,
		host: hp ? hp[1].replace(/^\[|\]$/g, '') : hostport,
		port: hp && hp[2] ? parseInt(hp[2], 10) : 0,
		query: query,
		name: name
	};
}

function mkTransport(q) {
	var net = q.type || q.network || 'tcp';
	if (net === 'ws') {
		var t = { type: 'ws', path: q.path || '/' };
		if (q.host) t.headers = { Host: q.host };
		return t;
	}
	if (net === 'grpc')
		return { type: 'grpc', service_name: q.serviceName || q.service_name || '' };
	if (net === 'httpupgrade' || net === 'httpUpgrade')
		return { type: 'httpupgrade', path: q.path || '/', host: q.host || '' };
	if (net === 'h2' || net === 'http')
		return { type: 'http', path: q.path || '/', host: q.host || '' };
	return null; // tcp (xhttp/kcp — Xray-only, sing-box их не умеет)
}

function parseVless(link) {
	var p = urlParts(link, 'vless');
	if (!p.host || !p.port || !p.user) throw 'vless: не хватает host/port/uuid';
	var o = { type: 'vless', tag: p.name || p.host, server: p.host, server_port: p.port, uuid: p.user };
	if (p.query.flow) o.flow = p.query.flow;
	var sec = p.query.security || 'none';
	if (sec === 'reality' || sec === 'tls') {
		o.tls = {
			enabled: true,
			server_name: p.query.sni || p.host,
			utls: { enabled: true, fingerprint: p.query.fp || 'chrome' }
		};
		if (sec === 'reality')
			o.tls.reality = { enabled: true, public_key: p.query.pbk || '', short_id: p.query.sid || '' };
	}
	var tr = mkTransport(p.query);
	if (tr) o.transport = tr;
	return { outbound: o, meta: { label: o.tag, type: 'vless', server: p.host, port: p.port, reality: sec === 'reality' } };
}

function parseTrojan(link) {
	var p = urlParts(link, 'trojan');
	if (!p.host || !p.port) throw 'trojan: не хватает host/port';
	var o = {
		type: 'trojan', tag: p.name || p.host, server: p.host, server_port: p.port,
		password: p.user,
		tls: {
			enabled: true,
			server_name: p.query.sni || p.host,
			insecure: p.query.allowInsecure === '1' || p.query.insecure === '1',
			utls: { enabled: true, fingerprint: p.query.fp || 'chrome' }
		}
	};
	var tr = mkTransport(p.query);
	if (tr) o.transport = tr;
	return { outbound: o, meta: { label: o.tag, type: 'trojan', server: p.host, port: p.port, reality: false } };
}

function parseHy2(link, proto) {
	var p = urlParts(link, proto);
	if (!p.host || !p.port) throw 'hysteria2: не хватает host/port';
	var o = {
		type: 'hysteria2', tag: p.name || p.host, server: p.host, server_port: p.port,
		password: p.user,
		tls: {
			enabled: true,
			server_name: p.query.sni || p.host,
			insecure: p.query.insecure === '1'
		}
	};
	if (p.query.obfs === 'salamander' && p.query['obfs-password'])
		o.obfs = { type: 'salamander', password: p.query['obfs-password'] };
	return { outbound: o, meta: { label: o.tag, type: 'hysteria2', server: p.host, port: p.port, reality: false } };
}

function parseTuic(link) {
	var p = urlParts(link, 'tuic');
	var up = p.user.split(':');
	if (!p.host || !p.port || up.length < 2) throw 'tuic: нужен uuid:password@host:port';
	var o = {
		type: 'tuic', tag: p.name || p.host, server: p.host, server_port: p.port,
		uuid: up[0], password: up.slice(1).join(':'),
		congestion_control: p.query.congestion_control || 'bbr',
		tls: {
			enabled: true,
			server_name: p.query.sni || p.host,
			insecure: p.query.allow_insecure === '1' || p.query.insecure === '1'
		}
	};
	return { outbound: o, meta: { label: o.tag, type: 'tuic', server: p.host, port: p.port, reality: false } };
}

function b64(s) {
	s = s.replace(/-/g, '+').replace(/_/g, '/');
	while (s.length % 4) s += '=';
	return atob(s);
}

function parseSS(link) {
	var rest = link.slice(5);
	var name = '';
	var hi = rest.indexOf('#');
	if (hi >= 0) {
		try { name = decodeURIComponent(rest.slice(hi + 1)); } catch (e) { name = rest.slice(hi + 1); }
		rest = rest.slice(0, hi);
	}
	var qi = rest.indexOf('?');
	if (qi >= 0) rest = rest.slice(0, qi); // plugin-опции не тащим
	var method, password, host, port;
	var at = rest.lastIndexOf('@');
	if (at >= 0) {
		var userinfo = rest.slice(0, at);
		try { if (userinfo.indexOf(':') === -1) userinfo = b64(userinfo); } catch (e) {}
		var mp = userinfo.split(':');
		method = mp[0]; password = mp.slice(1).join(':');
		var hp = rest.slice(at + 1).match(/^(\[[0-9a-fA-F:.]+\]|[^:]*):?(\d*)$/);
		host = hp[1].replace(/^\[|\]$/g, ''); port = parseInt(hp[2] || '0', 10);
	} else {
		var dec = b64(rest); // method:pass@host:port
		var at2 = dec.lastIndexOf('@');
		var mp2 = dec.slice(0, at2).split(':');
		method = mp2[0]; password = mp2.slice(1).join(':');
		var hp2 = dec.slice(at2 + 1).match(/^(\[[0-9a-fA-F:.]+\]|[^:]*):?(\d*)$/);
		host = hp2[1].replace(/^\[|\]$/g, ''); port = parseInt(hp2[2] || '0', 10);
	}
	if (!host || !port || !method) throw 'ss: не смог разобрать ссылку';
	try { password = decodeURIComponent(password); } catch (e) {}
	var o = { type: 'shadowsocks', tag: name || host, server: host, server_port: port, method: method, password: password };
	return { outbound: o, meta: { label: o.tag, type: 'shadowsocks', server: host, port: port, reality: false } };
}

function parseVmess(link) {
	var j = JSON.parse(b64(link.slice(8)));
	var o = {
		type: 'vmess', tag: j.ps || j.add, server: j.add,
		server_port: parseInt(j.port, 10) || 0,
		uuid: j.id, security: j.scy || 'auto',
		alter_id: parseInt(j.aid, 10) || 0
	};
	if (j.tls === 'tls')
		o.tls = { enabled: true, server_name: j.sni || j.host || j.add,
			utls: { enabled: true, fingerprint: 'chrome' } };
	if (j.net === 'ws') {
		o.transport = { type: 'ws', path: j.path || '/' };
		if (j.host) o.transport.headers = { Host: j.host };
	} else if (j.net === 'grpc') {
		o.transport = { type: 'grpc', service_name: j.path || '' };
	}
	if (!o.server || !o.server_port || !o.uuid) throw 'vmess: не хватает add/port/id';
	return { outbound: o, meta: { label: o.tag, type: 'vmess', server: o.server, port: o.server_port, reality: false } };
}

function parseShareLink(link) {
	link = String(link || '').trim();
	var m = link.match(/^([a-z0-9]+):\/\//i);
	if (!m) return null;
	var proto = m[1].toLowerCase();
	try {
		if (proto === 'vless') return parseVless(link);
		if (proto === 'trojan') return parseTrojan(link);
		if (proto === 'hysteria2' || proto === 'hy2') return parseHy2(link, proto);
		if (proto === 'tuic') return parseTuic(link);
		if (proto === 'ss') return parseSS(link);
		if (proto === 'vmess') return parseVmess(link);
	} catch (e) {
		return { error: String(e) };
	}
	return { error: 'неизвестный протокол: ' + proto };
}

/* ---------- метрики (Wave 3.5) ---------- */

/* человеческий размер: 7338984303 → "6.8 ГБ" */
function fmtBytes(n) {
	if (n == null || isNaN(n)) return '—';
	n = Number(n);
	if (n < 0) n = 0;
	if (n < 1024) return Math.round(n) + ' Б';
	var u = [ 'КБ', 'МБ', 'ГБ', 'ТБ' ], i = -1;
	do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
	return (n >= 100 ? Math.round(n) : n.toFixed(n >= 10 ? 1 : 2)) + ' ' + u[i];
}

function fmtRate(n) { return fmtBytes(n) + '/с'; }

/* человеческая длительность: 3488248 → "40 д 8 ч" */
function fmtUptime(sec) {
	if (sec == null || isNaN(sec) || sec < 0) return '—';
	sec = Math.floor(sec);
	var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600),
		m = Math.floor(sec % 3600 / 60);
	if (d > 0) return d + ' д ' + h + ' ч';
	if (h > 0) return h + ' ч ' + m + ' мин';
	if (m > 0) return m + ' мин';
	return sec + ' с';
}

/* Мини area-chart на canvas без внешних библиотек (LuCI их не тащит).
   data — массив чисел; рисует сглаженную линию + градиентную заливку.
   Цвет — из CSS-переменной (по умолчанию --fn-accent). */
function drawArea(canvas, data, opts) {
	opts = opts || {};
	var dpr = window.devicePixelRatio || 1;
	var w = canvas.clientWidth, h = canvas.clientHeight;
	if (!w || !h) return;
	if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
	}
	var ctx = canvas.getContext('2d');
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, w, h);

	if (!data || data.length < 2) {
		ctx.fillStyle = 'rgba(255,255,255,.25)';
		ctx.font = '11px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('данные накапливаются…', w / 2, h / 2 + 4);
		return;
	}

	var cs = getComputedStyle(document.body);
	var col = (opts.color || cs.getPropertyValue('--fn-accent') || '#7c6cff').trim();

	// любой цвет → r,g,b (hex #rgb/#rrggbb или rgb()/rgba())
	function toRGB(c) {
		var m;
		if ((m = c.match(/^#([0-9a-f]{3,8})$/i))) {
			var hx = m[1];
			if (hx.length === 3 || hx.length === 4)
				hx = hx.slice(0, 3).split('').map(function(ch) { return ch + ch; }).join('');
			return [ parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16) ];
		}
		if ((m = c.match(/rgba?\(([^)]+)\)/)))
			return m[1].split(',').slice(0, 3).map(function(x) { return parseInt(x, 10) || 0; });
		return [ 124, 108, 255 ];
	}
	var rgb = toRGB(col);

	var max = 0;
	data.forEach(function(v) { if (v > max) max = v; });
	if (max <= 0) max = 1;
	var pad = 2, base = h - pad, top = pad + 6;
	var span = base - top;
	var stepX = (w - pad * 2) / (data.length - 1);

	function pt(i) {
		var v = data[i] < 0 ? 0 : data[i];
		return [ pad + i * stepX, base - (v / max) * span ];
	}

	// сглаженная линия через bezier по средним точкам
	var pts = data.map(function(_, i) { return pt(i); });
	var grad = ctx.createLinearGradient(0, top, 0, base);
	grad.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',.35)');
	grad.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
	ctx.beginPath();
	ctx.moveTo(pts[0][0], base);
	ctx.lineTo(pts[0][0], pts[0][1]);
	for (var i = 1; i < pts.length; i++) {
		var mx = (pts[i - 1][0] + pts[i][0]) / 2;
		ctx.bezierCurveTo(mx, pts[i - 1][1], mx, pts[i][1], pts[i][0], pts[i][1]);
	}
	ctx.lineTo(pts[pts.length - 1][0], base);
	ctx.closePath();
	ctx.fillStyle = grad;
	ctx.fill();

	ctx.beginPath();
	ctx.moveTo(pts[0][0], pts[0][1]);
	for (var j = 1; j < pts.length; j++) {
		var mx2 = (pts[j - 1][0] + pts[j][0]) / 2;
		ctx.bezierCurveTo(mx2, pts[j - 1][1], mx2, pts[j][1], pts[j][0], pts[j][1]);
	}
	ctx.strokeStyle = col;
	ctx.lineWidth = 1.8;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.stroke();

	// точка на последнем значении
	ctx.beginPath();
	ctx.arc(pts[pts.length - 1][0], pts[pts.length - 1][1], 2.6, 0, Math.PI * 2);
	ctx.fillStyle = col;
	ctx.fill();
}

return baseclass.extend({
	loadCSS: loadCSS,
	applyAccent: applyAccent,
	call: call,
	toggle: toggle,
	pingPill: pingPill,
	metricCell: metricCell,
	agoText: agoText,
	skelRows: skelRows,
	actBadge: actBadge,
	typeBadge: typeBadge,
	nav: nav,
	page: page,
	labelParts: labelParts,
	parseShareLink: parseShareLink,
	fmtBytes: fmtBytes,
	fmtRate: fmtRate,
	fmtUptime: fmtUptime,
	drawArea: drawArea,
	notify: function(msg) {
		if (window.ui && ui.addTimeLimitedNotification)
			ui.addTimeLimitedNotification(null, E('p', msg), 2500);
	},
	/* Карточка-заглушка, когда нужный ubus-метод ещё не реализован бэкендом */
	unavailCard: function(what) {
		return E('div', { 'class': 'fn-card' }, [
			E('div', { 'class': 'fn-rowitem', style: 'border:none;padding:4px 0' }, [
				E('span', { 'class': 'fn-dot y' }),
				E('div', [
					E('div', { 'class': 'fn-rowname' }, what + ': метод пока недоступен'),
					E('div', { 'class': 'fn-card-sub' },
						'Бэкенд ещё не отвечает на этот ubus-вызов — появится после обновления backend-части Морока.')
				])
			])
		]);
	}
});
