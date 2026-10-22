#!/usr/bin/ucode
// Morok metrics tick — один шаг сбора (Wave 3.5).
// Вызывается демоном metrics.sh раз в N секунд.
// Источники:
//   1) nft named counters (inet morok): dns/tcp/udp в tproxy + bypass direct-устройств
//   2) Clash API sing-box (127.0.0.1:9090), ЕСЛИ доступен:
//      /connections — per-connection upload/download + chains[0] (нода) + rule;
//      дельты между тиками скапливаем по нодам и правилам.
//      /proxies — history.delay для семплирования доступности нод (uptime).
// Результат: /var/etc/morok/metrics.json (атомарно: tmp + rename),
// состояние соединений: /var/etc/morok/metrics_conns.json.

'use strict';

import * as fs from 'fs';

const DIR = '/var/etc/morok';
const OUT = DIR + '/metrics.json';
const CONNS = DIR + '/metrics_conns.json';
const CLASH = 'http://127.0.0.1:9090';
const MAX_SAMPLES = 1440; // 24ч при шаге 60с

function safe_json(s) {
	let r = null;
	try { r = json(s); } catch (e) { r = null; }
	return r;
}

function read_json_file(path) {
	let s = fs.readfile(path);
	if (!s) return null;
	return safe_json(s);
}

function atomic_write(path, obj) {
	let tmp = path + '.tmp';
	fs.writefile(tmp, sprintf('%J', obj));
	fs.rename(tmp, path);
}

function sh_out(cmd) {
	let p = fs.popen(cmd + ' 2>/dev/null');
	if (!p) return '';
	let out = p.read('all');
	p.close();
	return out || '';
}

function http_get(url, timeout) {
	let body = sh_out(sprintf('curl -s -m %d %s', timeout, url));
	if (body == '') return null;
	return safe_json(body);
}

// ---- nft counters: { name: { packets, bytes } } ----
// (nft 1.1 не умеет `list counters <table>` — читаем всю таблицу)
function nft_counters() {
	let out = {};
	let j = safe_json(sh_out('nft -j list table inet morok'));
	if (!j || type(j.nftables) != 'array') return out;
	for (let e in j.nftables) {
		let c = e.counter;
		if (c && c.name) out[c.name] = { packets: c.packets || 0, bytes: c.bytes || 0 };
	}
	return out;
}

function num(v) { return (type(v) == 'int' || type(v) == 'double') ? v : 0; }

function main() {
	let now = time();
	let prev = read_json_file(OUT) || {};
	let state = read_json_file(CONNS) || {};
	let seen_conns = type(state.conns) == 'object' ? state.conns : {};

	// --- nft totals (кумулятивные счётчики ядра) ---
	let nft = nft_counters();
	let dns_b = num(nft.morok_dns_udp ? nft.morok_dns_udp.bytes : 0) +
		num(nft.morok_dns_tcp ? nft.morok_dns_tcp.bytes : 0);
	let tcp_b = num(nft.morok_tproxy_tcp ? nft.morok_tproxy_tcp.bytes : 0);
	let udp_b = num(nft.morok_tproxy_udp ? nft.morok_tproxy_udp.bytes : 0);
	let byp_b = num(nft.morok_dev_bypass ? nft.morok_dev_bypass.bytes : 0);

	// --- clash: per-connection дельты по нодам/правилам ---
	let nodes = type(prev.nodes) == 'object' ? prev.nodes : {};
	let rules = type(prev.rules) == 'object' ? prev.rules : {};
	let up_total = num(prev.last_up_total);
	let dn_total = num(prev.last_dn_total);
	let clash_ok = false;

	let conns = http_get(CLASH + '/connections', 3);
	if (conns) {
		clash_ok = true;
		up_total = num(conns.uploadTotal);
		dn_total = num(conns.downloadTotal);
		let alive_ids = {};
		if (type(conns.connections) == 'array') {
			for (let c in conns.connections) {
				let id = c.id;
				if (!id) continue;
				alive_ids[id] = true;
				let u = num(c.upload), d = num(c.download);
				let old = seen_conns[id];
				let du = old ? u - num(old.u) : u;
				let dd = old ? d - num(old.d) : d;
				seen_conns[id] = { u: u, d: d };
				if (du < 0) du = 0;
				if (dd < 0) dd = 0;
				if (du == 0 && dd == 0) continue;
				let node = (type(c.chains) == 'array' && length(c.chains) > 0) ? c.chains[0] : '';
				if (node != '' && node != 'direct' && node != 'GLOBAL') {
					let n = nodes[node] || { up: 0, dn: 0, ok: 0, seen: 0 };
					n.up = num(n.up) + du;
					n.dn = num(n.dn) + dd;
					nodes[node] = n;
				}
				let rule = c.rule || 'unknown';
				rules[rule] = num(rules[rule]) + du + dd;
			}
		}
		// выкидываем закрывшиеся соединения (хвост дельты теряем — приемлемо)
		let kept = {};
		for (let id, v in seen_conns) {
			if (alive_ids[id]) kept[id] = v;
		}
		seen_conns = kept;
	}

	// --- доступность нод из /proxies (urltest health-checks sing-box) ---
	let proxies = clash_ok ? http_get(CLASH + '/proxies', 3) : null;
	if (proxies && type(proxies.proxies) == 'object') {
		for (let name, p in proxies.proxies) {
			if (substr(name, 0, 3) != 'cfg') continue; // только ноды UCI
			if (type(p.history) != 'array' || length(p.history) == 0) continue;
			let last = p.history[length(p.history) - 1];
			let n = nodes[name] || { up: 0, dn: 0, ok: 0, seen: 0 };
			n.seen = num(n.seen) + 1;
			if (num(last.delay) > 0) n.ok = num(n.ok) + 1;
			nodes[name] = n;
		}
	}

	// --- ring-buffer семплов (кумулятивные значения; rate считает UI) ---
	let samples = type(prev.samples) == 'array' ? prev.samples : [];
	push(samples, { t: now, dns: dns_b, tcp: tcp_b, udp: udp_b, byp: byp_b, up: up_total, dn: dn_total });
	if (length(samples) > MAX_SAMPLES)
		samples = slice(samples, length(samples) - MAX_SAMPLES);

	let out = {
		started: num(prev.started) || now,
		updated: now,
		interval: int(sh_out('uci -q get morok.globals.metrics_interval')) || 60,
		clash: clash_ok,
		last_up_total: up_total,
		last_dn_total: dn_total,
		samples: samples,
		nodes: nodes,
		rules: rules
	};
	atomic_write(OUT, out);
	atomic_write(CONNS, { conns: seen_conns });
}

main();
