#!/usr/bin/ucode
// Генератор конфига sing-box 1.14+ из UCI (/etc/config/morok).
// Запускается init-скриптом: ucode /usr/share/morok/gen_config.uc
// Результат: /var/etc/morok/sing-box.json (tmpfs — не жжём флеш).
//
// Особенности 1.14: DNS только в новом формате, geosite/geoip только
// через rule_set (.srs), block/dns-аутбоунды удалены (action: reject /
// hijack-dns), sniff — маршрутным правилом, а не полем инбаунда.

'use strict';

import { cursor } from 'uci';
import * as fs from 'fs';

const OUT_DIR = '/var/etc/morok';
const LIST_DIR = OUT_DIR + '/lists';
const RULESET_DIR = '/usr/share/morok/rulesets';
const STATE = OUT_DIR + '/adaptive_state.json';
// Обновлятор скачивает свежие .srs сюда же (ruleset_update.sh);
// источник — jsdelivr, raw.githubusercontent из РФ нестабилен.
const GEOSITE_SRS = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-%s.srs';
const GEOIP_SRS = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-%s.srs';

let c = cursor();
c.load('morok');

function gv(name, dflt) {
	let v = c.get('morok', 'globals', name);
	return v != null ? v : dflt;
}

// ---------- DNS-секция (читаем заранее: hijack влияет на route rules) ----------
// mode: sing-box — remote-DNS ходит через туннель; direct — напрямую.
// upstream: '8.8.8.8' (udp) | 'tls://1.1.1.1' | 'https://1.1.1.1/dns-query'
// hijack: globals.dns_hijack — перехватывать ли DNS-протокол в sing-box.
let dns_sec = c.get_all('morok', 'dns') || {};
let dns_mode = dns_sec.mode || 'sing-box';
let dns_upstream = dns_sec.upstream || 'https://1.1.1.1/dns-query';
let dns_hijack = gv('dns_hijack', '1') == '1';

function dns_remote_server(up, detour) {
	let s = { tag: 'remote', detour: detour };
	if (substr(up, 0, 8) == 'https://') {
		let rest = substr(up, 8);
		let slash = index(rest, '/');
		s.type = 'https';
		s.server = slash >= 0 ? substr(rest, 0, slash) : rest;
		let path = slash >= 0 ? substr(rest, slash) : '';
		if (path != '' && path != '/dns-query') s.path = path;
	} else if (substr(up, 0, 6) == 'tls://') {
		s.type = 'tls';
		s.server = substr(up, 6);
	} else if (substr(up, 0, 6) == 'udp://') {
		s.type = 'udp';
		s.server = substr(up, 6);
	} else {
		s.type = 'udp';
		s.server = up;
	}
	// апстрим по домену (dns.google и т.п.) — резолвим его местным DNS,
	// иначе курица-и-яйцо
	if (match(s.server, /^[0-9.]+$/) == null && index(s.server, ':') < 0)
		s.domain_resolver = 'local';
	return s;
}

// ---------- outbounds из нод ----------

function node_outbound(s) {
	// нода из подписки: отдаём исходный outbound verbatim, меняем только tag
	if (s.raw && s.raw != '') {
		let o = json(s.raw);
		// raw ноды awg — не sing-box outbound (junk-параметры AmneziaWG
		// в нём не выразить), обрабатываем по типу ниже
		if (o && o.type != 'awg' && o.type != 'amneziawg') {
			// xhttp (и прочие Xray-only транспорты) sing-box не умеет —
			// нода ждёт engine=xray, здесь пропускаем, иначе sing-box check
			// уронит весь конфиг
			if (o.transport && o.transport.type &&
				o.transport.type != 'ws' && o.transport.type != 'grpc' &&
				o.transport.type != 'httpupgrade' && o.transport.type != 'http') {
				warn(sprintf('[morok] нода %s: транспорт %s не поддержан sing-box — пропускаю (доступна при engine=xray)\n',
					s['.name'], o.transport.type));
				return null;
			}
			o.tag = s['.name'];
			return o;
		}
	}
	let type = s.type;
	if (type == 'vless') {
		let o = {
			type: 'vless', tag: s['.name'],
			server: s.server, server_port: int(s.port),
			uuid: s.uuid,
			tls: { enabled: true, server_name: s.sni || s.server, utls: { enabled: true, fingerprint: 'chrome' } }
		};
		if (s.flow && s.flow != '') o.flow = s.flow;
		if (s.reality == '1') {
			o.tls.reality = {
				enabled: true,
				public_key: s.reality_public_key,
				short_id: s.reality_short_id || ''
			};
		}
		return o;
	}
	if (type == 'trojan') {
		return {
			type: 'trojan', tag: s['.name'],
			server: s.server, server_port: int(s.port),
			password: s.password,
			tls: { enabled: true, server_name: s.sni || s.server,
				insecure: s.insecure == '1',
				utls: { enabled: true, fingerprint: 'chrome' } }
		};
	}
	if (type == 'hysteria2') {
		return {
			type: 'hysteria2', tag: s['.name'],
			server: s.server, server_port: int(s.port),
			password: s.password,
			tls: { enabled: true, server_name: s.sni || s.server, insecure: s.insecure == '1' }
		};
	}
	if (type == 'tuic') {
		return {
			type: 'tuic', tag: s['.name'],
			server: s.server, server_port: int(s.port),
			uuid: s.uuid, password: s.password,
			congestion_control: s.congestion || 'bbr',
			tls: { enabled: true, server_name: s.sni || s.server, insecure: s.insecure == '1' }
		};
	}
	if (type == 'shadowsocks') {
		return {
			type: 'shadowsocks', tag: s['.name'],
			server: s.server, server_port: int(s.port),
			method: s.method || '2022-blake3-aes-128-gcm',
			password: s.password
		};
	}
	if (type == 'wireguard') {
		return {
			type: 'wireguard', tag: s['.name'],
			server: s.server, server_port: int(s.port),
			local_address: s.address || [],
			private_key: s.private_key,
			peer_public_key: s.peer_public_key
		};
	}
	if (type == 'awg' || type == 'amneziawg') {
		if (!awg_kmod_present()) {
			warn(sprintf('[morok] нода %s: kmod-amneziawg не установлен — awg недоступен, пропускаю\n', s['.name']));
			return null;
		}
		// системный интерфейс поднимает awg.sh; сюда — direct c bind+mark
		return {
			type: 'direct', tag: s['.name'],
			bind_interface: 'awg-' + s['.name'],
			routing_mark: 29000 + (awg_idx[s['.name']] || 0)
		};
	}
	warn(sprintf('[morok] нода %s: неизвестный тип %s\n', s['.name'], type));
	return null;
}

// ---------- awg (AmneziaWG, Wave 3.1) ----------
// junk-параметры AmneziaWG — ядерные, в sing-box wireguard-outbound их
// не выразить → нода awg = системный интерфейс (поднимает awg.sh),
// а здесь — direct-outbound, прибитый к интерфейсу (bind_interface) и
// помеченный fwmark; ip rule/table делает awg.sh.
// mark = 29000 + <порядковый номер включённой awg-ноды в порядке foreach>
// — ту же нумерацию используют awg.sh и xray_gen.uc.
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

let outbounds = [];
let enabled_nodes = [];
c.foreach('morok', 'node', function(s) {
	if (s.enabled != '1') return;
	let o = node_outbound(s);
	if (o) {
		push(outbounds, o);
		push(enabled_nodes, s['.name']);
	}
});

// ---------- фоллбэк-цепочка: urltest-group ----------
let fb = c.get_all('morok', 'fallback') || {};
let chain = fb.chain || enabled_nodes;
let active = gv('active_node', '');

// Жёсткая валидация ссылок на ноды: в конфиг sing-box попадают ТОЛЬКО
// имена включённых нод. Любая протухшая ссылка (удалённая/выключенная
// нода, мусор в UCI) отбрасывается с warning — иначе sing-box падает
// с "default outbound not found" и уносит весь сервис в crash-loop.
let have_node = {};
for (let n in enabled_nodes) have_node[n] = 1;

let ordered = [];
if (active && active != '') {
	if (have_node[active])
		push(ordered, active);
	else
		warn(sprintf('[morok] active_node "%s" не найден среди включённых нод — игнорирую\n', active));
}
for (let n in chain) {
	if (n == active) continue;
	if (have_node[n])
		push(ordered, n);
	else
		warn(sprintf('[morok] цепочка: нода "%s" не найдена/выключена — выкидываю из urltest\n', n));
}
if (length(ordered) == 0) ordered = enabled_nodes;

let proxy_tag = 'proxy';
if (length(ordered) > 1) {
	push(outbounds, {
		type: 'urltest',
		tag: 'proxy',
		outbounds: ordered,
		url: fb.test_url || 'https://www.gstatic.com/generate_204',
		interval: (fb.test_interval || '10') + 's',
		tolerance: 50,
		interrupt_exist_connections: false
	});
} else if (length(ordered) == 1) {
	proxy_tag = ordered[0];
} else {
	// нет ни одной включённой ноды: поднимаем заглушку, чтобы sing-box
	// стартовал (final=direct), а не падал в crash-loop
	warn('[morok] нет включённых нод — proxy заглушен в direct\n');
	push(outbounds, { type: 'direct', tag: 'proxy' });
}

push(outbounds, { type: 'direct', tag: 'direct' });

// ---------- rule-sets ----------
let rule_sets = [];
let have_set = {};

function add_geosite(name) {
	let tag = 'geosite-' + name;
	if (have_set[tag]) return tag;
	have_set[tag] = 1;
	// локальный .srs: старт не зависит от доступности GitHub
	push(rule_sets, {
		type: 'local', tag: tag, format: 'binary',
		path: RULESET_DIR + '/' + tag + '.srs'
	});
	return tag;
}

function add_geoip(name) {
	let tag = 'geoip-' + name;
	if (have_set[tag]) return tag;
	have_set[tag] = 1;
	push(rule_sets, {
		type: 'local', tag: tag, format: 'binary',
		path: RULESET_DIR + '/' + tag + '.srs'
	});
	return tag;
}

// ---------- адаптивное состояние сторожа ----------
let adaptive = {};
let state_raw = fs.readfile(STATE);
if (state_raw) adaptive = json(state_raw) || {};

// ---------- правила маршрутизации ----------
// ВАЖНО: порядок правил = порядок секций rule в UCI (foreach идёт по
// конфигу сверху вниз; перестановка — rpcd-метод reorder_rules).
// sing-box берёт ПЕРВЫЙ матч, поэтому узкие antidpi-правила должны
// стоять выше широких proxy-списков.
let route_rules = [
	{ action: 'sniff' }
];
if (dns_hijack)
	push(route_rules, { protocol: 'dns', action: 'hijack-dns' });

// ---------- per-device маршрутизация (Wave 1) ----------
// route=proxy|node:<id> — весь трафик устройства в туннель независимо от
// доменных правил: source_ip-правило ставим первым после sniff/hijack-dns.
// ОГРАНИЧЕНИЕ: MAC→IP резолвим по /tmp/dhcp.leases, т.е. устройство должно
// быть DHCP-клиентом роутера. Статические IP без лизы сюда не попадут
// (route=direct такие случаи переживает — он работает по MAC в nft).
// route=node:<id> — stretch Wave 1: мапится на proxy (общий туннель),
// выделенный outbound на устройство — позже.
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
	if (substr(rt, 0, 5) == 'node:') {
		warn(sprintf('[morok] устройство %s: route=%s — в Wave 1 мапится на proxy\n', s.mac, rt));
		rt = 'proxy';
	}
	if (rt != 'proxy') return;
	let ip = dev_leases[lc(s.mac || '')];
	if (ip)
		push(dev_proxy_ips, ip);
	else
		warn(sprintf('[morok] устройство %s (%s): route=proxy, но нет DHCP-лизы — правило пропущено\n',
			s.label || '?', s.mac));
});
if (length(dev_proxy_ips) > 0)
	push(route_rules, { source_ip: dev_proxy_ips, outbound: proxy_tag });
let g_final = null;
let dns_local_sets = [];
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

	let r = {};
	if (act == 'block') {
		r.action = 'reject';
	} else {
		r.outbound = (act == 'direct' || act == 'antidpi') ? 'direct' : proxy_tag;
	}

	let mt = s.match_type;
	if (mt == 'geosite') {
		let sets = [];
		for (let m in (s.match || [])) push(sets, add_geosite(m));
		r.rule_set = sets;
	} else if (mt == 'geosite_geoip') {
		let sets = [];
		for (let m in (s.match || [])) {
			if (length(m) == 2) push(sets, add_geoip(m));
			else push(sets, add_geosite(m));
		}
		r.rule_set = sets;
		// RU-домены резолвим местным DNS
		for (let t in sets) {
			if (substr(t, 0, 8) == 'geosite-' && !dns_local_seen[t]) {
				dns_local_seen[t] = 1;
				push(dns_local_sets, t);
			}
		}
	} else if (mt == 'custom') {
		let tag = 'set-' + id;
		if (!have_set[tag]) {
			have_set[tag] = 1;
			push(rule_sets, {
				type: 'inline', tag: tag,
				rules: [ { domain_suffix: s.match || [] } ]
			});
		}
		r.rule_set = [ tag ];
	} else if (mt == 'source_list') {
		// внешний список — конвертируется в source-JSON скриптом lst2srs.sh
		let tag = 'src-' + (s.source || id);
		let path = LIST_DIR + '/' + (s.source || id) + '.json';
		if (fs.stat(path)) {
			if (!have_set[tag]) {
				have_set[tag] = 1;
				push(rule_sets, { type: 'local', tag: tag, format: 'source', path: path });
			}
			r.rule_set = [ tag ];
		} else {
			warn(sprintf('[morok] правило "%s": список %s ещё не скачан — правило пропущено\n',
				s.label || id, path));
			return;
		}
	}
	push(route_rules, r);
});

// ---------- DNS (новый формат 1.12+) ----------
let dns_rules = [];
if (length(dns_local_sets) > 0)
	push(dns_rules, { rule_set: dns_local_sets, server: 'local' });

let dns = {
	servers: [
		dns_remote_server(dns_upstream, dns_mode == 'sing-box' ? proxy_tag : 'direct'),
		{ tag: 'local', type: 'udp', server: '223.5.5.5' }
	],
	rules: dns_rules,
	final: 'remote',
	strategy: 'ipv4_only'
};

// ---------- inbounds ----------
let inbounds = [];
if (gv('transparent', '1') == '1') {
	push(inbounds, {
		type: 'tproxy', tag: 'tproxy-in',
		listen: '::', listen_port: 7895
	});
}
push(inbounds, {
	type: 'mixed', tag: 'mixed-in',
	listen: '127.0.0.1', listen_port: 7890
});

// ---------- route ----------
let route = {
	rules: route_rules,
	rule_set: rule_sets,
	final: g_final || proxy_tag,
	// домены нод резолвим напрямую через местный DNS
	default_domain_resolver: 'local',
	auto_detect_interface: true
};

// ---------- Clash API: живые метрики для rpcd-бэкенда ----------
// В 1.14 из clash_api уехало всё, кроме контроллера: mode/selected —
// теперь поля cache_file.
let experimental = {
	cache_file: { enabled: true, path: OUT_DIR + '/cache.db' },
	clash_api: {
		external_controller: '127.0.0.1:9090'
	}
};

let config = {
	log: { level: gv('log_level', 'warn'), timestamp: true },
	dns: dns,
	inbounds: inbounds,
	outbounds: outbounds,
	route: route,
	experimental: experimental
};

// ---------- запись ----------
// Атомарно: tmp + rename. Параллельный `sing-box check` (два reload
// подряд) никогда не увидит недописанный конфиг.
fs.mkdir(OUT_DIR);
fs.mkdir(LIST_DIR);
let tmppath = OUT_DIR + '/.sing-box.json.tmp';
let f = fs.open(tmppath, 'w');
if (!f) {
	warn('[morok] не могу записать ' + tmppath + '\n');
	exit(1);
}
f.write(config);
f.close();
fs.rename(tmppath, OUT_DIR + '/sing-box.json');
printf('[morok] конфиг: %d нод, цепочка %s, %d rule-sets, %d правил\n',
	length(enabled_nodes), join(' -> ', ordered), length(rule_sets), length(route_rules));
