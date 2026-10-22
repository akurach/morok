#!/usr/bin/ucode
// xray_gen.uc — генератор конфига Xray из UCI (/etc/config/morok),
// альтернатива gen_config.uc при globals.engine='xray' (Wave 3.2).
// Запускается init-скриптом: ucode /usr/share/morok/xray_gen.uc
// Результат: /var/etc/morok/xray.json (tmpfs).
//
// Зачем: sing-box не умеет транспорт xhttp (и некоторые новые плюшки
// Xray-core); современные подписки всё чаще отдают xhttp-ноды.
//
// Отличия от sing-box генератора:
// - ноды хранятся в UCI как sing-box outbound JSON (option raw) —
//   конвертируем sing-box → xray формат (sb2xray);
// - geosite .srs xray не читает → доменные правила генерируем напрямую
//   из текстовых source-списков rulesets/src/*.txt (они же лежат рядом
//   для check_domain); geoip — через "geoip:<cc>" (нужен geoip.dat —
//   xray ищет его в /usr/share/xray и /usr/share/v2ray; при отсутствии
//   geoip-подправило пропускается с warning);
// - source_list: читаем sing-box source-JSON (lists/<src>.json) и
//   разворачиваем в xray domain/ip правила напрямую;
// - urltest-цепочка → observatory + balancer leastPing;
// - DNS-хиджак: nft заворачивает :53 в tproxy :7895 (как при sing-box),
//   дальше routing-правило port 53 → dns-out (protocol dns) → модуль dns.
//
// ucode-грабли (TZ §2): функции объявлены ДО использования; for..of нет;
// rindex/index сравнивать с >= 0; внешний JSON — через safe_json.

'use strict';

import { cursor } from 'uci';
import * as fs from 'fs';

const OUT_DIR = '/var/etc/morok';
const LIST_DIR = OUT_DIR + '/lists';
const RULESET_DIR = '/usr/share/morok/rulesets';
const STATE = OUT_DIR + '/adaptive_state.json';

function safe_json(s) {
	let r = null;
	try { r = json(s); } catch (e) { r = null; }
	return r;
}

let c = cursor();
c.load('morok');

function gv(name, dflt) {
	let v = c.get('morok', 'globals', name);
	return v != null ? v : dflt;
}

function trim(s) {
	if (s == null) return '';
	return replace(replace(s, /^\s+/, ''), /\s+$/, '');
}

// ---------- DNS: секция morok.dns (общая с sing-box генератором) ----------
let dns_sec = c.get_all('morok', 'dns') || {};
let dns_mode = dns_sec.mode || 'sing-box';
let dns_upstream = dns_sec.upstream || 'https://1.1.1.1/dns-query';
let dns_hijack = gv('dns_hijack', '1') == '1';

// ---------- транспорт: sing-box transport → xray streamSettings ----------

function xray_transport(tr) {
	if (!tr || !tr.type) return {};
	if (tr.type == 'ws') {
		let s = { network: 'ws', wsSettings: { path: tr.path || '/' } };
		if (tr.headers && tr.headers.Host)
			s.wsSettings.headers = { Host: tr.headers.Host };
		return s;
	}
	if (tr.type == 'grpc')
		return { network: 'grpc', grpcSettings: { serviceName: tr.service_name || '' } };
	if (tr.type == 'httpupgrade')
		return { network: 'httpupgrade',
			httpupgradeSettings: { path: tr.path || '/', host: tr.host || '' } };
	if (tr.type == 'http') {
		let hosts = [];
		if (tr.host && tr.host != '') push(hosts, tr.host);
		return { network: 'http', httpSettings: { path: tr.path || '/', host: hosts } };
	}
	// xhttp — главная причина существования engine=xray
	if (tr.type == 'xhttp') {
		let xs = { path: tr.path || '/' };
		if (tr.host && tr.host != '') xs.host = tr.host;
		if (tr.mode && tr.mode != '') xs.mode = tr.mode;   // auto|packet-up|stream-up|stream-one
		return { network: 'xhttp', xhttpSettings: xs };
	}
	return {};
}

// sing-box tls{} → куски xray streamSettings
function xray_tls(tls) {
	if (!tls || !tls.enabled) return {};
	let fp = 'chrome';
	if (tls.utls && tls.utls.fingerprint) fp = tls.utls.fingerprint;
	if (tls.reality && tls.reality.enabled)
		return {
			security: 'reality',
			realitySettings: {
				serverName: tls.server_name || '',
				fingerprint: fp,
				publicKey: tls.reality.public_key || '',
				shortId: tls.reality.short_id || ''
			}
		};
	return {
		security: 'tls',
		tlsSettings: {
			serverName: tls.server_name || '',
			fingerprint: fp,
			allowInsecure: tls.insecure == true
		}
	};
}

// конвертер sing-box outbound → xray outbound; null = не поддержан
function sb2xray(o) {
	if (!o || !o.type) return null;
	let t = o.type;
	if (t == 'hysteria2' || t == 'tuic') {
		warn(sprintf('[morok/xray] нода %s: xray не умеет %s — пропускаю\n', o.tag, t));
		return null;
	}
	if (t == 'direct' || t == 'block' || t == 'dns' || t == 'urltest')
		return null; // служебные, не ноды
	let ss = xray_transport(o.transport);
	let tl = xray_tls(o.tls);
	for (let k, v in tl) ss[k] = v;
	if (!ss.network) ss.network = 'tcp';

	if (t == 'vless') {
		let user = { id: o.uuid, encryption: 'none' };
		// flow (xtls-rprx-vision) имеет смысл только с tls/reality
		if (o.flow && o.flow != '' && ss.security)
			user.flow = o.flow;
		return {
			protocol: 'vless', tag: o.tag,
			settings: { vnext: [ {
				address: o.server, port: int(o.server_port),
				users: [ user ]
			} ] },
			streamSettings: ss
		};
	}
	if (t == 'vmess') {
		return {
			protocol: 'vmess', tag: o.tag,
			settings: { vnext: [ {
				address: o.server, port: int(o.server_port),
				users: [ {
					id: o.uuid,
					alterId: int(o.alter_id || 0),
					security: o.security || 'auto'
				} ]
			} ] },
			streamSettings: ss
		};
	}
	if (t == 'trojan') {
		return {
			protocol: 'trojan', tag: o.tag,
			settings: { servers: [ {
				address: o.server, port: int(o.server_port),
				password: o.password
			} ] },
			streamSettings: ss
		};
	}
	if (t == 'shadowsocks') {
		return {
			protocol: 'shadowsocks', tag: o.tag,
			settings: { servers: [ {
				address: o.server, port: int(o.server_port),
				method: o.method, password: o.password
			} ] },
			streamSettings: ss
		};
	}
	if (t == 'wireguard') {
		return {
			protocol: 'wireguard', tag: o.tag,
			settings: {
				secretKey: o.private_key,
				address: o.local_address || [],
				peers: [ {
					publicKey: o.peer_public_key,
					endpoint: o.server + ':' + o.server_port
				} ]
			}
		};
	}
	// amneziawg: системный интерфейс поднимает awg.sh; здесь — freedom,
	// прибитый к интерфейсу (junk-параметры AmneziaWG ядерные, их не
	// выразить в xray wireguard-outbound); mark — тот же, что ставит awg.sh
	if (t == 'awg' || t == 'amneziawg') {
		return {
			protocol: 'freedom', tag: o.tag,
			settings: { domainStrategy: 'UseIPv4' },
			streamSettings: { sockopt: {
				interface: o.bind_interface || '',
				mark: o.routing_mark || 0
			} }
		};
	}
	warn(sprintf('[morok/xray] нода %s: неизвестный тип %s — пропускаю\n', o.tag, t));
	return null;
}

// sing-box-образ ноды: из raw verbatim, либо собираем из UCI-полей
// (ручные ноды без raw — тот же минимум, что и gen_config.uc)
function node_sb_style(s) {
	if (s.raw && s.raw != '') {
		let o = safe_json(s.raw);
		// raw ноды awg — не proxy-outbound (см. gen_config.uc), по типу ниже
		if (o && o.type != 'awg' && o.type != 'amneziawg') {
			o.tag = s['.name'];
			return o;
		}
	}
	let type = s.type;
	let o = { type: type, tag: s['.name'], server: s.server, server_port: int(s.port) };
	if (type == 'vless') {
		o.uuid = s.uuid;
		if (s.flow && s.flow != '') o.flow = s.flow;
		o.tls = { enabled: true, server_name: s.sni || s.server };
		if (s.reality == '1')
			o.tls.reality = { enabled: true,
				public_key: s.reality_public_key,
				short_id: s.reality_short_id || '' };
	} else if (type == 'trojan' || type == 'hysteria2') {
		o.password = s.password;
		o.tls = { enabled: true, server_name: s.sni || s.server, insecure: s.insecure == '1' };
	} else if (type == 'shadowsocks') {
		o.method = s.method || '2022-blake3-aes-128-gcm';
		o.password = s.password;
	} else if (type == 'vmess') {
		o.uuid = s.uuid;
		o.alter_id = int(s.alter_id || 0);
	} else if (type == 'wireguard') {
		o.private_key = s.private_key;
		o.peer_public_key = s.peer_public_key;
		o.local_address = s.address || [];
	} else if (type == 'awg') {
		// системный интерфейс; имя стабильно по id секции;
		// mark/table — общая нумерация с awg.sh (29000 + порядковый номер)
		o.bind_interface = 'awg-' + s['.name'];
		o.routing_mark = 29000 + (awg_idx[s['.name']] || 0);
	} else {
		return null;
	}
	return o;
}

// ---------- awg (Wave 3.1): детект kmod и нумерация нод (общая с awg.sh) ----------
function awg_kmod_present() {
	let p = fs.popen("ls /lib/modules/*/amneziawg.ko 2>/dev/null | head -1; lsmod 2>/dev/null | awk '$1==\"amneziawg\"{print $1}' | head -1");
	if (!p) return false;
	let out = p.read('all');
	p.close();
	return out != null && replace(out, /\s+/g, '') != '';
}

let awg_idx = {};
let awg_n = 0;
c.foreach('morok', 'node', function(s) {
	if (s.enabled == '1' && s.type == 'awg') {
		awg_n++;
		awg_idx[s['.name']] = awg_n;
	}
});

// ---------- outbounds из нод ----------
let outbounds = [];
let enabled_nodes = [];
let skipped_nodes = [];
c.foreach('morok', 'node', function(s) {
	if (s.enabled != '1') return;
	if (s.type == 'awg' && !awg_kmod_present()) {
		warn(sprintf('[morok/xray] нода %s: kmod-amneziawg не установлен — пропускаю\n', s['.name']));
		push(skipped_nodes, s['.name']);
		return;
	}
	let sb = node_sb_style(s);
	if (!sb) {
		push(skipped_nodes, s['.name']);
		return;
	}
	let o = sb2xray(sb);
	if (o) {
		push(outbounds, o);
		push(enabled_nodes, s['.name']);
	} else {
		push(skipped_nodes, s['.name']);
	}
});

// ---------- фоллбэк-цепочка: observatory + balancer (аналог urltest) ----------
let fb = c.get_all('morok', 'fallback') || {};
let chain = fb.chain || enabled_nodes;
let active = gv('active_node', '');

// та же жёсткая валидация ссылок, что в gen_config.uc
let have_node = {};
for (let n in enabled_nodes) have_node[n] = 1;

let ordered = [];
if (active && active != '') {
	if (have_node[active])
		push(ordered, active);
	else
		warn(sprintf('[morok/xray] active_node "%s" не найден среди включённых нод — игнорирую\n', active));
}
for (let n in chain) {
	if (n == active) continue;
	if (have_node[n])
		push(ordered, n);
	else
		warn(sprintf('[morok/xray] цепочка: нода "%s" не найдена/выключена — выкидываю из балансера\n', n));
}
if (length(ordered) == 0) ordered = enabled_nodes;

let proxy_tag = 'proxy';
let proxy_is_balancer = false;
let observatory = null;
if (length(ordered) > 1) {
	proxy_is_balancer = true;
	observatory = {
		subjectSelector: ordered,
		probeUrl: fb.test_url || 'https://www.gstatic.com/generate_204',
		probeInterval: (fb.test_interval || '10') + 's',
		enableConcurrency: true
	};
} else if (length(ordered) == 1) {
	proxy_tag = ordered[0];
} else {
	warn('[morok/xray] нет включённых нод — proxy заглушен в direct\n');
}

push(outbounds, { protocol: 'freedom', tag: 'direct', settings: {} });
push(outbounds, { protocol: 'blackhole', tag: 'block', settings: {} });
push(outbounds, { protocol: 'dns', tag: 'dns-out' });

// цель правила: balancerTag для балансера, outboundTag для ноды
function set_target(r, tag, is_balancer) {
	if (is_balancer) r.balancerTag = tag;
	else r.outboundTag = tag;
	return r;
}

// ---------- доменные списки ----------
// geosite: текстовые source-списки rulesets/src/geosite-<m>.txt —
// те же домены, что в .srs; xray синтаксис: plain → "domain:",
// full:/regexp:/keyword: — как есть (списки Loyalsoldier их содержат).
let set_domains_cache = {};

function load_set_domains(m) {
	if (set_domains_cache[m]) return set_domains_cache[m];
	let doms = [];
	for (let f in [ RULESET_DIR + '/src/geosite-' + m + '.txt',
			RULESET_DIR + '/src/' + m + '.txt' ]) {
		let raw = fs.readfile(f);
		if (!raw) continue;
		for (let line in split(raw, '\n')) {
			line = trim(line);
			if (line == '' || substr(line, 0, 1) == '#') continue;
			if (match(line, /^(full|regexp|keyword|domain|geosite):/))
				push(doms, line);
			else
				push(doms, 'domain:' + line);
		}
		break;
	}
	set_domains_cache[m] = doms;
	return doms;
}

// geoip.dat: ищем там, где xray смотрит по умолчанию (и у GL-прошивки)
function have_geoip_dat() {
	for (let f in [ '/usr/share/xray/geoip.dat', '/usr/share/v2ray/geoip.dat',
			'/usr/lib/morok/geo/geoip.dat' ])
		if (fs.stat(f)) return true;
	return false;
}
let geoip_dat = have_geoip_dat();

// source_list: sing-box source-JSON → xray domain/ip правила
function load_source_list(src) {
	let path = LIST_DIR + '/' + src + '.json';
	let raw = fs.readfile(path);
	if (!raw) return null;
	let j = safe_json(raw);
	if (!j || type(j.rules) != 'array' || length(j.rules) == 0) return null;
	let doms = [], ips = [];
	for (let r in j.rules) {
		for (let d in (r.domain_suffix || [])) push(doms, 'domain:' + d);
		for (let d in (r.domain || [])) push(doms, 'full:' + d);
		for (let d in (r.domain_keyword || [])) push(doms, 'keyword:' + d);
		for (let d in (r.domain_regex || [])) push(doms, 'regexp:' + d);
		for (let i in (r.ip_cidr || [])) push(ips, i);
	}
	return { domains: doms, ips: ips };
}

// ---------- адаптивное состояние сторожа (общее с sing-box) ----------
let adaptive = {};
let state_raw = fs.readfile(STATE);
if (state_raw) adaptive = safe_json(state_raw) || {};

// ---------- правила маршрутизации ----------
// Порядок = порядок секций rule в UCI, как в gen_config.uc.
let route_rules = [];

// DNS-хиджак: DNS, прилетевший в tproxy :7895, — в dns-out
if (dns_hijack)
	push(route_rules, { type: 'field', port: '53', network: 'tcp,udp', outboundTag: 'dns-out' });

// per-device proxy (та же логика DHCP-лиз, что в gen_config.uc)
let dev_proxy_ips = [];
let dev_leases = {};
let leases_raw = fs.readfile('/tmp/dhcp.leases');
if (leases_raw) {
	for (let line in split(leases_raw, '\n')) {
		let f = split(line, ' ');
		if (length(f) < 3 || f[1] == '') continue;
		dev_leases[lc(f[1])] = f[2];
	}
}
c.foreach('morok', 'device', function(s) {
	if (s.enabled != '1') return;
	let rt = s.route || 'follow';
	if (substr(rt, 0, 5) == 'node:') rt = 'proxy'; // выделенный outbound — позже
	if (rt != 'proxy') return;
	let ip = dev_leases[lc(s.mac || '')];
	if (ip)
		push(dev_proxy_ips, ip);
	else
		warn(sprintf('[morok/xray] устройство %s: route=proxy, но нет DHCP-лизы — правило пропущено\n', s.mac));
});
if (length(dev_proxy_ips) > 0)
	push(route_rules, set_target({ type: 'field', source: dev_proxy_ips }, proxy_tag, proxy_is_balancer));

let g_final = null;
let dns_local_domains = [];
let dns_local_seen = {};
let rule_idx = -1;

c.foreach('morok', 'rule', function(s) {
	rule_idx++;
	if (s.enabled != '1') return;
	let id = s['.name'];
	let act = s.action || 'proxy';
	if (act == 'antidpi' && adaptive['' + rule_idx] == 'proxy') act = 'proxy';

	if (s.match_type == 'final') {
		g_final = (act == 'direct') ? 'direct' : proxy_tag;
		return;
	}

	// собираем домены/IP правила
	let doms = [], ips = [];
	let mt = s.match_type;
	if (mt == 'geosite') {
		for (let m in (s.match || []))
			for (let d in load_set_domains(m)) push(doms, d);
	} else if (mt == 'geosite_geoip') {
		for (let m in (s.match || [])) {
			if (length(m) == 2) {
				// geoip:cc — нужен geoip.dat (см. шапку)
				if (geoip_dat)
					push(ips, 'geoip:' + lc(m));
				else
					warn(sprintf('[morok/xray] правило "%s": geoip:%s пропущен — нет geoip.dat\n',
						s.label || id, m));
			} else {
				for (let d in load_set_domains(m)) push(doms, d);
				// RU-домены резолвим местным DNS (как dns_rules в sing-box)
				if (!dns_local_seen[m]) {
					dns_local_seen[m] = 1;
					for (let d in load_set_domains(m)) push(dns_local_domains, d);
				}
			}
		}
	} else if (mt == 'custom') {
		for (let m in (s.match || [])) {
			m = lc(replace('' + m, /^\*\.?/, ''));
			if (m != '') push(doms, 'domain:' + m);
		}
	} else if (mt == 'source_list') {
		let sl = load_source_list(s.source || id);
		if (sl) {
			for (let d in sl.domains) push(doms, d);
			for (let i in sl.ips) push(ips, i);
		} else {
			warn(sprintf('[morok/xray] правило "%s": список %s ещё не скачан — правило пропущено\n',
				s.label || id, s.source || id));
			return;
		}
	}

	if (length(doms) == 0 && length(ips) == 0) {
		warn(sprintf('[morok/xray] правило "%s": пустой набор матчей — пропущено\n', s.label || id));
		return;
	}
	let target = (act == 'direct' || act == 'antidpi') ? 'direct'
		: (act == 'block' ? 'block' : proxy_tag);
	let tb = (act == 'direct' || act == 'antidpi' || act == 'block') ? false : proxy_is_balancer;
	if (length(doms) > 0)
		push(route_rules, set_target({ type: 'field', domain: doms }, target, tb));
	if (length(ips) > 0)
		push(route_rules, set_target({ type: 'field', ip: ips }, target, tb));
});

// финал — catch-all (у xray нет поля final у routing)
push(route_rules, set_target({ type: 'field', network: 'tcp,udp' },
	g_final || proxy_tag, (g_final == null || g_final == proxy_tag) ? proxy_is_balancer : false));

// ---------- DNS-модуль ----------
let dns_servers = [];
if (length(dns_local_domains) > 0)
	push(dns_servers, { address: '223.5.5.5', domains: dns_local_domains });
// апстрим по сети: при mode=sing-box DoH-запросы попадают в routing и
// уходят по final (туннелю); mode=direct — резолвер прямой (223.5.5.5)
push(dns_servers, dns_upstream);
if (dns_mode != 'sing-box')
	push(dns_servers, '223.5.5.5');
let dns = {
	servers: dns_servers,
	queryStrategy: 'UseIPv4',
	tag: 'dns-internal'
};

// ---------- inbounds ----------
let inbounds = [];
if (gv('transparent', '1') == '1') {
	push(inbounds, {
		tag: 'tproxy-in',
		protocol: 'dokodemo-door',
		listen: '::',
		port: 7895,
		settings: { network: 'tcp,udp' },
		streamSettings: { sockopt: { tproxy: 'tproxy' } },
		sniffing: { enabled: true, destOverride: [ 'http', 'tls', 'quic' ] }
	});
}
push(inbounds, {
	tag: 'http-in',
	protocol: 'http',
	listen: '127.0.0.1',
	port: 7890
});
push(inbounds, {
	tag: 'socks-in',
	protocol: 'socks',
	listen: '127.0.0.1',
	port: 7891,
	settings: { udp: true }
});

// ---------- routing ----------
let routing = {
	domainStrategy: 'IPIfNonMatch',
	rules: route_rules
};
if (proxy_is_balancer)
	routing.balancers = [ {
		tag: 'proxy',
		selector: ordered,
		strategy: { type: 'leastPing' }
	} ];

let log_level = lc(gv('log_level', 'warn'));
let xray_loglevel = 'warning';
if (log_level == 'debug' || log_level == 'trace') xray_loglevel = 'debug';
else if (log_level == 'info') xray_loglevel = 'info';
else if (log_level == 'error' || log_level == 'fatal' || log_level == 'panic') xray_loglevel = 'error';

let config = {
	log: { loglevel: xray_loglevel },
	dns: dns,
	inbounds: inbounds,
	outbounds: outbounds,
	routing: routing
};
if (observatory)
	config.observatory = observatory;

// ---------- запись (атомарно, tmp + rename) ----------
fs.mkdir(OUT_DIR);
fs.mkdir(LIST_DIR);
let tmppath = OUT_DIR + '/.xray.json.tmp';
let f = fs.open(tmppath, 'w');
if (!f) {
	warn('[morok/xray] не могу записать ' + tmppath + '\n');
	exit(1);
}
f.write(sprintf('%J', config));
f.close();
fs.rename(tmppath, OUT_DIR + '/xray.json');
printf('[morok/xray] конфиг: %d нод (%d пропущено), цепочка %s, %d правил, geoip.dat: %s\n',
	length(enabled_nodes), length(skipped_nodes), join(' -> ', ordered),
	length(route_rules), geoip_dat ? 'есть' : 'НЕТ');
