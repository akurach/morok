'use strict';
/* mock-data.js — вымышленные данные ubus для скриншотов.
   ВАЖНО: всё ниже — демо. Никаких реальных серверов, подписок, ключей,
   доменов провайдеров. Endpoint'ы — из документационных диапазонов
   RFC 5737 (198.51.100.0/24, 203.0.113.0/24), ссылки — на example.com. */

(function() {

/* детерминированный PRNG, чтобы скриншоты были воспроизводимы */
function mulberry32(a) {
	return function() {
		a |= 0; a = a + 0x6D2B79F5 | 0;
		var t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
var rnd = mulberry32(20260214);

var now = Math.floor(Date.now() / 1000);

/* ---------- ноды (вымышленные) ---------- */
var nodes = [
	{ id: 'n1', label: '🇳🇱 Amsterdam 1', type: 'vless', server: '198.51.100.14', port: 443,
		enabled: true, group: 'Demo Provider', origin: 'subscription', reality: true,
		tcp_ms: 38, url_ms: 42, dns_ok: null, ping: 42 },
	{ id: 'n2', label: '🇩🇪 Frankfurt 2', type: 'vless', server: '198.51.100.23', port: 8443,
		enabled: true, group: 'Demo Provider', origin: 'subscription', reality: true,
		tcp_ms: 61, url_ms: 68, dns_ok: null, ping: 68 },
	{ id: 'n3', label: '🇫🇮 Helsinki 1', type: 'trojan', server: '198.51.100.37', port: 443,
		enabled: true, group: 'Demo Provider', origin: 'subscription', reality: false,
		tcp_ms: 88, url_ms: 95, dns_ok: null, ping: 95 },
	{ id: 'n4', label: '🇳🇱 Amsterdam 2', type: 'hysteria2', server: '198.51.100.41', port: 32015,
		enabled: true, group: 'Demo Provider', origin: 'subscription', reality: false,
		tcp_ms: 47, url_ms: 54, dns_ok: null, ping: 54 },
	{ id: 'n5', label: '🇸🇪 Stockholm 1', type: 'vless', server: '198.51.100.52', port: 443,
		enabled: false, group: 'Demo Provider', origin: 'subscription', reality: true,
		tcp_ms: null, url_ms: null, dns_ok: null, ping: null },
	{ id: 'm1', label: '🏠 Домашний VPS', type: 'ss', server: '203.0.113.10', port: 8388,
		enabled: true, group: 'Manual', origin: 'manual', reality: false,
		tcp_ms: 152, url_ms: 171, dns_ok: null, ping: 171 }
];

var subscriptions = [
	{ id: 'sub1', label: 'Demo Provider',
		url: [ 'https://sub.example.com/api/v1/client/demo-a1b2c3', 'https://sub-backup.example.com/api/v1/client/demo-a1b2c3' ],
		enabled: true, update_interval: 21600, last_update: now - 2 * 3600 - 900,
		user_agent: 'sing-box', hwid: false }
];

var status = {
	running: true, mode: 'smart', engine: 'sing-box',
	active_node: 'n1', active_label: '🇳🇱 Amsterdam 1', active_ping: 42,
	all_dead: false, active_broken: false,
	chain: [ 'n1', 'n2', 'n3' ],
	kill_switch: 'direct', auto_return: '1',
	enabled: true, transparent: true, antidpi: true,
	awg_available: true, wizard_done: '1'
};

/* ---------- правила и источники ---------- */
var rules = [
	{ id: 'r1', label: 'YouTube', match_type: 'source_list', source: 'src-youtube',
		action: 'antidpi', enabled: true },
	{ id: 'r2', label: 'Discord', match_type: 'source_list', source: 'src-discord',
		action: 'proxy', enabled: true },
	{ id: 'r3', label: 'Meta', match_type: 'geosite', match: [ 'meta', 'facebook', 'instagram' ],
		action: 'proxy', enabled: true },
	{ id: 'r4', label: 'Локальные сервисы', match_type: 'geosite_geoip', match: [ 'category-ru', 'ru' ],
		action: 'direct', enabled: true },
	{ id: 'r5', label: 'Рекламные сети', match_type: 'custom',
		match: [ 'ads.example.com', 'track.example.net', 'metrics.example.org' ],
		action: 'block', enabled: true },
	{ id: 'r6', label: 'TikTok', match_type: 'source_list', source: 'src-tiktok',
		action: 'proxy', enabled: false },
	{ id: 'r7', label: 'Всё остальное', match_type: 'final', match: [],
		action: 'direct', enabled: true }
];

var sources = [
	{ id: 'src-youtube', label: 'YouTube (community list)',
		url: 'https://lists.example.com/community/youtube.txt', enabled: true, update_interval: 86400 },
	{ id: 'src-discord', label: 'Discord (community list)',
		url: 'https://lists.example.com/community/discord.txt', enabled: true, update_interval: 86400 },
	{ id: 'src-meta', label: 'Meta (community list)',
		url: 'https://lists.example.com/community/meta.txt', enabled: true, update_interval: 86400 },
	{ id: 'src-tiktok', label: 'TikTok (community list)',
		url: 'https://lists.example.com/community/tiktok.txt', enabled: false, update_interval: 86400 }
];

/* ---------- метрики: ~3 ч семплов раз в минуту ---------- */
function buildMetrics() {
	var NS = 181;
	var started = now - (NS - 1) * 60;
	var samples = [];
	var tcp = 412000000, udp = 96000000, dn = 465000000, up = 52000000, dns = 8400000;
	for (var i = 0; i < NS; i++) {
		/* правдоподобная «живая» скорость: фон ~0.2–2 МБ/с, всплески до ~9 МБ/с */
		var base = 200000 + rnd() * 1800000;
		if (rnd() < 0.07) base += 4000000 + rnd() * 5000000; /* стрим/загрузка */
		if (rnd() < 0.10) base = 30000 + rnd() * 120000;      /* простой */
		var d = Math.round(base * 60);
		var ddns = Math.round(1200 + rnd() * 4500);
		tcp += Math.round(d * 0.86);
		udp += Math.round(d * 0.14);
		dn += Math.round(d * 0.92);
		up += Math.round(d * 0.08);
		dns += ddns;
		samples.push({ t: started + i * 60, tcp: tcp, udp: udp, dn: dn, up: up, dns: dns });
	}
	return {
		empty: false, clash: true,
		started: started, updated: now,
		singbox_uptime: 2 * 86400 + 6 * 3600 + 24 * 60,
		samples: samples,
		rules: {
			'rule_set=set-r1 => route(antidpi)': 2290000000,
			'rule_set=set-r2 => route(proxy)': 873000000,
			'rule_set=set-r3 => route(proxy)': 410000000,
			'rule_set=[geosite-category-ru geoip-ru] => route(direct)': 318000000,
			'final': 1240000000
		},
		nodes: {
			'n1': { up: 148000000, dn: 3100000000, seen: 180, ok: 179 },
			'n2': { up: 12000000, dn: 262000000, seen: 180, ok: 180 },
			'n3': { up: 3000000, dn: 41000000, seen: 180, ok: 176 }
		}
	};
}

/* ---------- маркет пресетов ---------- */
var market = { presets: [
	{ id: 'p-video', emoji: '🎬', label: 'Видеохостинги',
		description: 'YouTube и сопутствующие CDN — через оптимизацию доставки, без VPN. Профиль nfqws2 применится автоматически.',
		sources: [ { label: 'YouTube (community list)', url: 'https://lists.example.com/community/youtube.txt', update_interval: 86400 } ],
		rules: [ { label: 'YouTube', source: 'YouTube (community list)', action: 'antidpi' } ],
		antidpi_strategy: 'youtube' },
	{ id: 'p-voice', emoji: '💬', label: 'Мессенджеры и голос',
		description: 'Discord: голосовые каналы и медиа — через туннель, остальное не трогаем.',
		sources: [ { label: 'Discord (community list)', url: 'https://lists.example.com/community/discord.txt', update_interval: 86400 } ],
		rules: [ { label: 'Discord', source: 'Discord (community list)', action: 'proxy' } ] },
	{ id: 'p-meta', emoji: '📸', label: 'Meta',
		description: 'Instagram, Facebook, Threads и CDN Meta — через туннель по geosite.',
		sources: [],
		rules: [ { label: 'Meta', match_type: 'geosite', match: [ 'meta', 'facebook', 'instagram' ], action: 'proxy' } ] },
	{ id: 'p-tiktok', emoji: '🎵', label: 'TikTok',
		description: 'TikTok и его CDN — через туннель. Два правила: приложение и веб.',
		sources: [ { label: 'TikTok (community list)', url: 'https://lists.example.com/community/tiktok.txt', update_interval: 86400 } ],
		rules: [
			{ label: 'TikTok', source: 'TikTok (community list)', action: 'proxy' },
			{ label: 'TikTok CDN', match_type: 'geosite', match: [ 'tiktokcdn' ], action: 'proxy' }
		] },
	{ id: 'p-media', emoji: '📰', label: 'Независимые медиа',
		description: 'Кураторский список новостных сайтов — через туннель.',
		sources: [ { label: 'Independent media (community list)', url: 'https://lists.example.com/community/media.txt', update_interval: 86400 } ],
		rules: [ { label: 'Независимые медиа', source: 'Independent media (community list)', action: 'proxy' } ] },
	{ id: 'p-games', emoji: '🎮', label: 'Игровые сервисы',
		description: 'Steam, Epic, Battle.net — напрямую для минимального пинга, лаунчеры с региональными ограничениями — через туннель.',
		sources: [],
		rules: [
			{ label: 'Игровые CDN', match_type: 'geosite', match: [ 'steam', 'epicgames' ], action: 'direct' },
			{ label: 'Игровые лаунчеры', match_type: 'custom', match: [ 'launcher.example.com' ], action: 'proxy' }
		] },
	{ id: 'p-ai', emoji: '🧩', label: 'AI-сервисы',
		description: 'Популярные AI-ассистенты и API — через туннель, адаптивный сторож включён.',
		sources: [],
		rules: [ { label: 'AI-сервисы', match_type: 'geosite', match: [ 'openai', 'anthropic' ], action: 'proxy', adaptive: true } ] }
] };

/* ---------- оптимизация доставки ---------- */
var antidpi = {
	engine: 'zapret2', running: true,
	strategy: 'youtube', strategy_custom: '',
	strategies: [
		{ id: 'youtube', label: 'YouTube (стандарт)',
			desc: 'фрагментация ClientHello + multisplit по SLD — проверенный профиль для видеохостингов' },
		{ id: 'multisplit', label: 'Универсальный multisplit',
			desc: 'разрез пакетов в нескольких позициях — когда стандартный профиль не помогает' },
		{ id: 'hostcase', label: 'Hostcase + fake',
			desc: 'модификация регистра Host и подложный первый пакет — мягкий вариант' },
		{ id: 'custom', label: 'Свой профиль',
			desc: 'ручная строка аргументов nfqws2 — для тех, кто знает, что делает' }
	],
	guardian: { mode: 'antidpi', state_text: 'следим за 1 правилом оптимизации' },
	rules_count: 1,
	hostlist: [ 'youtube.com', 'googlevideo.com', 'ytimg.com', 'ggpht.com',
		'youtu.be', 'youtube-nocookie.com', 'youtubei.googleapis.com', 'youtube.googleapis.com' ]
};

var scanStatus = {
	running: false, stopped: false, done: 6, total: 6,
	domains: [ 'youtube.com', 'googlevideo.com' ],
	results: [
		{ id: 'youtube', label: 'YouTube (стандарт)', domain_results: {
			'youtube.com': { code: '200', ms: 312 }, 'googlevideo.com': { code: '200', ms: 388 } } },
		{ id: 'multisplit', label: 'Универсальный multisplit', domain_results: {
			'youtube.com': { code: '200', ms: 401 }, 'googlevideo.com': { code: '200', ms: 455 } } },
		{ id: 'hostcase', label: 'Hostcase + fake', domain_results: {
			'youtube.com': { code: '200', ms: 512 }, 'googlevideo.com': { code: '000', ms: 3001 } } },
		{ id: 'disorder', label: 'Disorder', domain_results: {
			'youtube.com': { code: '000', ms: 3002 }, 'googlevideo.com': { code: '000', ms: 3000 } } },
		{ id: 'fake-tls', label: 'Fake TLS', domain_results: {
			'youtube.com': { code: '200', ms: 476 }, 'googlevideo.com': { code: '200', ms: 530 } } },
		{ id: 'syssplit', label: 'Syscall split', domain_results: {
			'youtube.com': { code: '000', ms: 3001 }, 'googlevideo.com': { code: '000', ms: 3003 } } }
	]
};

/* ---------- компоненты ---------- */
var components = { components: [
	{ name: 'sing-box', version: '1.14.0', path: '/usr/lib/morok/bin/sing-box',
		sha256: '4f8c2b91d7e6a0c3b5f18e2d9a4c7b06e1f3a5d8c2b4e6f9a0d3c5e7b8f1a2c4' },
	{ name: 'xray', version: '26.9.9', path: '/usr/lib/morok/bin/xray',
		sha256: 'b7e1d4f6a8c0e2d5f7a9b1c3e5d7f9a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2' },
	{ name: 'nfqws2', version: '1.0.5.2', path: '/usr/lib/morok/bin/nfqws2',
		sha256: 'c9a3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3' }
] };

/* ---------- устройства ---------- */
var devices = { devices: [
	{ mac: '3E:5F:12:88:AA:01', ip: '192.168.8.142', hostname: 'iphone-anna', label: 'iPhone Анны',
		online: true, route: 'follow', enabled: true },
	{ mac: '8C:85:90:1F:2B:77', ip: '192.168.8.110', hostname: 'macbook-air', label: 'MacBook Air',
		online: true, route: 'direct', enabled: true },
	{ mac: '64:FF:0A:3C:91:DE', ip: '192.168.8.135', hostname: 'samsung-tv', label: 'Телевизор',
		online: true, route: 'node:n1', enabled: true },
	{ mac: 'F0:2F:74:55:0E:19', ip: '192.168.8.121', hostname: 'desktop-work', label: 'Рабочий ПК',
		online: true, route: 'proxy', enabled: true },
	{ mac: 'A4:83:E7:22:6C:40', ip: '192.168.8.153', hostname: 'ps5', label: 'PlayStation 5',
		online: false, route: 'follow', enabled: true },
	{ mac: 'D8:BB:C1:09:F4:82', ip: '192.168.8.160', hostname: 'smart-speaker', label: 'Умная колонка',
		online: false, route: 'follow', enabled: false }
] };

/* ---------- диспетчер ---------- */
window.MOROK_MOCK = {
	'morok.status': function() { return status; },
	'morok.nodes': function() { return { nodes: nodes, subscriptions: subscriptions }; },
	'morok.chain': function() { return { fallback: { chain: [ 'n1', 'n2', 'n3' ] }, nodes: nodes }; },
	'morok.rules': function() { return { rules: rules }; },
	'morok.sources': function() { return { sources: sources }; },
	'morok.test_nodes': function() { return { ok: true, results: nodes }; },
	'morok.devices': function() { return devices; },
	'morok.market': function() { return market; },
	'morok.components': function() { return components; },
	'morok.get_antidpi': function() { return antidpi; },
	'morok.scan_status': function() { return scanStatus; },
	'morok.guardian_status': function() { return { mode: 'antidpi', state_text: 'следим' }; },
	'morok.app_check': function() {
		return { ok: true, current: '0.9.2', latest: '0.9.4', update_available: true,
			notes: 'Стабильность guardian, мелкие правки интерфейса.' };
	},
	'morok_metrics.read': function() { return window.__MOROK_MX || (window.__MOROK_MX = buildMetrics()); },
	/* мутации — всегда успешны, состояние стенда не меняем */
	'morok.set_global': function() { return { ok: true }; },
	'morok.set_fallback': function() { return { ok: true }; },
	'morok.apply': function() { return { ok: true }; },
	'morok.set_node': function() { return { ok: true }; },
	'morok.select_node': function() { return { ok: true }; },
	'morok.set_rule': function() { return { ok: true }; },
	'morok.set_source': function() { return { ok: true }; },
	'morok.set_device': function() { return { ok: true }; },
	'uci.commit': function() { return { ok: true }; }
};

})();
