#!/usr/bin/ucode
// parse_nodes.uc <subscription-id> <raw-файл>
// Парсит подписку в UCI-ноды.
// Поддерживает: sing-box JSON (outbounds) и base64/share-ссылки
// (vless, vmess, trojan, ss, hysteria2/hy2, tuic).
// Стратегия: нода хранит ИСХОДНЫЙ outbound verbatim (option raw) —
// gen_config отдаёт его в sing-box как есть, ломаться нечему.
// Ноды подписки помечаются origin=<sid>; при обновлении устаревшие
// ноды этой подписки удаляются.
//
// ВАЖНО: все функции объявлены ДО первого использования — ucode
// вычисляет function-декларации по ходу исполнения top-level кода.

'use strict';

import { cursor } from 'uci';
import * as fs from 'fs';

const CONF = 'morok';

// ---------- helpers ----------

// int('0x..') в ucode НЕ парсит hex (возвращает 0) — свой hexval
function hexval(h) {
	let v = 0;
	for (let i = 0; i < length(h); i++) {
		let ch = substr(h, i, 1);
		let d;
		if (ch >= '0' && ch <= '9') d = ord(ch) - 48;
		else if (ch >= 'a' && ch <= 'f') d = ord(ch) - 87;
		else if (ch >= 'A' && ch <= 'F') d = ord(ch) - 55;
		else return 0;
		v = v * 16 + d;
	}
	return v;
}

// url-декодирование %XX (плюс НЕ трогаем — в fragment это литерал)
function urldec(s) {
	if (s == null) return '';
	return replace('' + s, /%([0-9A-Fa-f]{2})/g, function(m, h) {
		return chr(hexval(h));
	});
}

function splitq(q) {
	let o = {};
	if (!q) return o;
	for (let p in split(q, '&')) {
		if (p == '') continue;
		let i = index(p, '=');
		if (i >= 0)
			o[urldec(substr(p, 0, i))] = urldec(substr(p, i + 1));
		else
			o[urldec(p)] = '';
	}
	return o;
}

// разбор userinfo@host:port?query#fragment
function urlparts(link, proto) {
	let rest = substr(link, length(proto) + 3);
	let name = '';
	let hi = index(rest, '#');
	if (hi >= 0) {
		name = urldec(substr(rest, hi + 1));
		rest = substr(rest, 0, hi);
	}
	let query = {};
	let qi = index(rest, '?');
	if (qi >= 0) {
		query = splitq(substr(rest, qi + 1));
		rest = substr(rest, 0, qi);
	}
	let at = rindex(rest, '@');
	let user = at >= 0 ? substr(rest, 0, at) : '';
	let hostport = at >= 0 ? substr(rest, at + 1) : rest;
	user = urldec(user);
	let m = match(hostport, /^(\[[0-9a-fA-F:.]+\]|[^:]*):?([0-9]*)$/);
	return {
		user: user,
		host: m ? replace(m[1], /^\[|\]$/g, '') : hostport,
		port: m && m[2] != '' ? int(m[2]) : 0,
		query: query,
		name: name
	};
}

function mk_transport(q) {
	let net = q.type || q.network || 'tcp';
	if (net == 'ws') {
		let t = { type: 'ws', path: q.path || '/' };
		if (q.host) t.headers = { Host: q.host };
		return t;
	}
	if (net == 'grpc')
		return { type: 'grpc', service_name: q.serviceName || q.service_name || '' };
	if (net == 'httpupgrade')
		return { type: 'httpupgrade', path: q.path || '/', host: q.host || '' };
	if (net == 'h2' || net == 'http')
		return { type: 'http', path: q.path || '/', host: q.host || '' };
	// xhttp — транспорт Xray-core; sing-box его не умеет: gen_config.uc
	// такую ноду пропустит с warning, engine=xray (xray_gen.uc) — отыграет
	if (net == 'xhttp') {
		let t = { type: 'xhttp', path: q.path || '/' };
		if (q.host) t.host = q.host;
		if (q.mode) t.mode = q.mode; // auto|packet-up|stream-up|stream-one
		return t;
	}
	return null; // tcp (kcp — Xray-only, не тащим)
}

function b64(s) {
	s = replace(s, /-/g, '+');
	s = replace(s, /_/g, '/');
	while (length(s) % 4) s += '=';
	return b64dec(s);
}

// ---------- парсеры протоколов: на выходе sing-box outbound ----------

function parse_vless(link) {
	let p = urlparts(link, 'vless');
	if (!p.host || !p.port || !p.user) return null;
	let o = { type: 'vless', tag: p.name || p.host, server: p.host, server_port: p.port, uuid: p.user };
	if (p.query.flow) o.flow = p.query.flow;
	let sec = p.query.security || 'none';
	if (sec == 'reality' || sec == 'tls') {
		o.tls = {
			enabled: true,
			server_name: p.query.sni || p.host,
			utls: { enabled: true, fingerprint: p.query.fp || 'chrome' }
		};
		if (sec == 'reality')
			o.tls.reality = { enabled: true, public_key: p.query.pbk || '', short_id: p.query.sid || '' };
	}
	let tr = mk_transport(p.query);
	if (tr) o.transport = tr;
	return o;
}

function parse_trojan(link) {
	let p = urlparts(link, 'trojan');
	if (!p.host || !p.port) return null;
	let o = {
		type: 'trojan', tag: p.name || p.host, server: p.host, server_port: p.port,
		password: p.user,
		tls: {
			enabled: true,
			server_name: p.query.sni || p.host,
			insecure: p.query.allowInsecure == '1' || p.query.insecure == '1',
			utls: { enabled: true, fingerprint: p.query.fp || 'chrome' }
		}
	};
	let tr = mk_transport(p.query);
	if (tr) o.transport = tr;
	return o;
}

function parse_hy2(link, proto) {
	let p = urlparts(link, proto);
	if (!p.host || !p.port) return null;
	let o = {
		type: 'hysteria2', tag: p.name || p.host, server: p.host, server_port: p.port,
		password: p.user,
		tls: {
			enabled: true,
			server_name: p.query.sni || p.host,
			insecure: p.query.insecure == '1'
		}
	};
	if (p.query.obfs == 'salamander' && p.query['obfs-password'])
		o.obfs = { type: 'salamander', password: p.query['obfs-password'] };
	return o;
}

function parse_tuic(link) {
	let p = urlparts(link, 'tuic');
	let up = split(p.user, ':');
	if (!p.host || !p.port || length(up) < 2) return null;
	return {
		type: 'tuic', tag: p.name || p.host, server: p.host, server_port: p.port,
		uuid: up[0], password: join(':', slice(up, 1)),
		congestion_control: p.query.congestion_control || 'bbr',
		tls: {
			enabled: true,
			server_name: p.query.sni || p.host,
			insecure: p.query.allow_insecure == '1' || p.query.insecure == '1'
		}
	};
}

function parse_ss(link) {
	let rest = substr(link, 5);
	let name = '';
	let hi = index(rest, '#');
	if (hi >= 0) {
		name = urldec(substr(rest, hi + 1));
		rest = substr(rest, 0, hi);
	}
	let qi = index(rest, '?');
	if (qi >= 0) rest = substr(rest, 0, qi); // plugin-опции не тащим
	let method, password, host, port;
	let at = rindex(rest, '@');
	if (at >= 0) {
		let userinfo = substr(rest, 0, at);
		if (index(userinfo, ':') < 0) userinfo = b64(userinfo);
		let mp = split(userinfo, ':');
		method = mp[0];
		password = join(':', slice(mp, 1));
		let m = match(substr(rest, at + 1), /^(\[[0-9a-fA-F:.]+\]|[^:]*):?([0-9]*)$/);
		if (!m) return null;
		host = replace(m[1], /^\[|\]$/g, '');
		port = m[2] != '' ? int(m[2]) : 0;
	} else {
		let dec = b64(rest); // method:pass@host:port целиком
		if (!dec) return null;
		let at2 = rindex(dec, '@');
		if (at2 < 0) return null;
		let mp2 = split(substr(dec, 0, at2), ':');
		method = mp2[0];
		password = join(':', slice(mp2, 1));
		let m2 = match(substr(dec, at2 + 1), /^(\[[0-9a-fA-F:.]+\]|[^:]*):?([0-9]*)$/);
		if (!m2) return null;
		host = replace(m2[1], /^\[|\]$/g, '');
		port = m2[2] != '' ? int(m2[2]) : 0;
	}
	if (!host || !port || !method) return null;
	password = urldec(password);
	return { type: 'shadowsocks', tag: name || host, server: host, server_port: port, method: method, password: password };
}

function parse_vmess(link) {
	let j = json(b64(substr(link, 8)));
	if (!j) return null;
	let o = {
		type: 'vmess', tag: j.ps || j.add, server: j.add,
		server_port: int(j.port) || 0,
		uuid: j.id, security: j.scy || 'auto',
		alter_id: int(j.aid) || 0
	};
	if (j.tls == 'tls')
		o.tls = { enabled: true, server_name: j.sni || j.host || j.add,
			utls: { enabled: true, fingerprint: 'chrome' } };
	if (j.net == 'ws') {
		o.transport = { type: 'ws', path: j.path || '/' };
		if (j.host) o.transport.headers = { Host: j.host };
	} else if (j.net == 'grpc') {
		o.transport = { type: 'grpc', service_name: j.path || '' };
	} else if (j.net == 'xhttp') {
		o.transport = { type: 'xhttp', path: j.path || '/' };
		if (j.host) o.transport.host = j.host;
	}
	if (!o.server || !o.server_port || !o.uuid) return null;
	return o;
}

function parse_share_link(line) {
	let m = match(line, /^([a-zA-Z0-9]+):\/\//);
	if (!m) return null;
	let proto = lc(m[1]);
	if (proto == 'vless') return parse_vless(line);
	if (proto == 'trojan') return parse_trojan(line);
	if (proto == 'hysteria2' || proto == 'hy2') return parse_hy2(line, proto);
	if (proto == 'tuic') return parse_tuic(line);
	if (proto == 'ss') return parse_ss(line);
	if (proto == 'vmess') return parse_vmess(line);
	return null;
}

// заглушки/мусор не заводим: панели любят отдавать 0.0.0.0-ноды
// с инструкциями вместо реальных конфигов
function is_junk(o) {
	if (!o.server || o.server == '' || o.server == '0.0.0.0' ||
	    o.server == '127.0.0.1' || o.server == 'localhost')
		return true;
	if (!o.server_port || o.server_port <= 1)
		return true;
	// односимвольные/односегментные «хосты» вида @1:443 — мусор
	// панелей под конкретные приложения, не публичный адрес
	if (index(o.server, '.') < 0 && index(o.server, ':') < 0)
		return true;
	return false;
}

// ---------- входные аргументы ----------

let sid = ARGV[0];
let rawfile = ARGV[1];
if (!sid || !rawfile) {
	warn('usage: parse_nodes.uc <sid> <rawfile>\n');
	exit(1);
}

let raw = fs.readfile(rawfile);
if (!raw) { warn('не могу прочитать ' + rawfile + '\n'); exit(1); }

// ---------- вытаскиваем outbounds ----------
let outbounds = [];
let skipped_junk = 0;
let trimmed = rtrim(ltrim(raw));

if (substr(trimmed, 0, 1) == '{') {
	// sing-box JSON
	let doc = json(trimmed);
	if (doc && type(doc.outbounds) == 'array') {
		for (let o in doc.outbounds) {
			let t = o.type;
			if (t == 'vless' || t == 'trojan' || t == 'hysteria2' ||
			    t == 'tuic' || t == 'shadowsocks' || t == 'vmess' ||
			    t == 'wireguard')
				push(outbounds, o);
		}
	}
} else {
	// base64 со share-ссылками (или ссылки в открытом виде)
	let decoded = b64dec(trimmed);
	if (!decoded) decoded = trimmed;
	for (let line in split(decoded, '\n')) {
		line = rtrim(ltrim(line));
		if (line == '') continue;
		let o = parse_share_link(line);
		if (o) {
			if (is_junk(o)) {
				skipped_junk++;
				warn(sprintf('%s: пропускаю заглушку «%s» (%s:%s)\n',
					sid, o.tag || '?', o.server || '?', o.server_port || '?'));
			} else {
				push(outbounds, o);
			}
		}
	}
}

if (length(outbounds) == 0) {
	warn(sprintf('%s: прокси-нод в подписке не найдено (заглушек пропущено: %d)\n', sid, skipped_junk));
	exit(1);
}

// ---------- пишем в UCI ----------
let c = cursor();
c.load(CONF);

let label = c.get(CONF, sid, 'label') || sid;

// существующие ноды этой подписки — переиспользуем секции,
// чтобы ссылки на них (active_node, цепочка) не протухали
let existing = [];
c.foreach(CONF, 'node', function(s) {
	if (s.origin == sid) push(existing, s['.name']);
});

let kept = {};
let idx = 0;
for (let o in outbounds) {
	let id;
	if (idx < length(existing)) {
		id = existing[idx];
	} else {
		id = c.add(CONF, 'node');   // возвращает cfgXXXX
	}
	idx++;
	kept[id] = 1;

	let tag = o.tag || (o.server + ':' + o.server_port);

	c.set(CONF, id, 'enabled', '1');
	c.set(CONF, id, 'label', tag);
	c.set(CONF, id, 'group', label);
	c.set(CONF, id, 'type', o.type);
	c.set(CONF, id, 'server', '' + (o.server || ''));
	c.set(CONF, id, 'port', '' + (o.server_port || ''));
	c.set(CONF, id, 'origin', sid);
	// исходный outbound как JSON — verbatim
	let raw_json = sprintf('%J', o);
	c.set(CONF, id, 'raw', raw_json);
	if (o.tls && o.tls.reality && o.tls.reality.enabled)
		c.set(CONF, id, 'reality', '1');
	else
		c.delete(CONF, id, 'reality');
}

// устаревшие ноды этой подписки — удалить
let removed = 0;
for (let id in existing) {
	if (!kept[id]) {
		// не рвём ссылки: если нода в цепочке/активная — просто выключаем
		let active = c.get(CONF, 'globals', 'active_node');
		if (active == id) {
			c.set(CONF, id, 'enabled', '0');
			warn(sprintf('%s: нода %s удалена из подписки, но она активная — выключил\n', sid, id));
		} else {
			c.delete(CONF, id);
			removed++;
		}
	}
}

c.set(CONF, sid, 'last_update', '' + time());
c.commit(CONF);

printf('%s: %d нод (%d удалено устаревших, %d заглушек пропущено)\n',
	sid, length(outbounds), removed, skipped_junk);
