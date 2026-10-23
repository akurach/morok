'use strict';
/* shim.js — минимальная эмуляция LuCI-рантайма для оффлайн-рендера
   вьюх luci-app-morok в обычном браузере (headless Chrome).
   Покрывает только то, что реально используют view/morok/*.js:
   E(), L, baseclass, view, ui, rpc, poll, uci + загрузчик модулей
   по директивам 'require xxx'. */

/* ---------- E(): фабрика DOM-элементов как в LuCI ----------
   E('div', {attrs}, children): attrs с function-значением → addEventListener;
   children — строка/нода/плоский массив (вложенные массивы НЕ разворачиваются,
   как и в GL-сборке LuCI). */
function __appendKids(el, children) {
	if (children == null) return;
	var list = Array.isArray(children) ? children : [ children ];
	list.forEach(function(k) {
		if (k == null) return;
		if (k instanceof Node) { el.appendChild(k); return; }
		el.appendChild(document.createTextNode(String(k)));
	});
}

window.E = function(tag, attrs, children) {
	var el = (typeof tag === 'string') ? document.createElement(tag) : tag;
	if (attrs != null) {
		if (typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
			Object.keys(attrs).forEach(function(k) {
				var v = attrs[k];
				if (v == null) return;
				if (typeof v === 'function') el.addEventListener(k, v);
				else if (k === 'class') el.className = v;
				else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
				else el.setAttribute(k, v);
			});
		} else {
			children = attrs; /* второй аргумент оказался children */
		}
	}
	__appendKids(el, children);
	return el;
};

/* ---------- L ---------- */
window.L = {
	/* ресурсы приложения лежат в репо под luci-app-morok/htdocs/luci-static/resources/ */
	resource: function(p) { return '/luci-app-morok/htdocs/luci-static/resources/' + p; },
	url: function(p) { return '#' + p; },
	resolveDefault: function(promise, def) {
		return Promise.resolve(promise).then(function(res) {
			return (res != null) ? res : def;
		}, function() { return def; });
	},
	bind: function(fn, thisp) {
		var args = Array.prototype.slice.call(arguments, 2);
		return fn.bind.apply(fn, [ thisp ].concat(args));
	}
};

/* ---------- baseclass / view ---------- */
var baseclass = {
	extend: function(props) {
		var C = function() {};
		Object.assign(C.prototype, props);
		return C;
	}
};
var view = { extend: baseclass.extend };

/* ---------- rpc: ubus-декларации → мок-диспетчер ---------- */
var rpc = {
	declare: function(spec) {
		return function() {
			var args = Array.prototype.slice.call(arguments);
			var key = spec.object + '.' + spec.method;
			var mock = window.MOROK_MOCK || {};
			if (typeof mock[key] === 'function') {
				try {
					return Promise.resolve(mock[key].apply(null, args));
				} catch (e) {
					return Promise.reject(e);
				}
			}
			/* как в LuCI при отсутствующем ubus-методе */
			return Promise.reject(new Error('ubus: метод ' + key + ' не замокан'));
		};
	}
};

/* ---------- ui ---------- */
var ui = {
	showModal: function(title, children) {
		this.hideModal();
		var modal = E('div', { 'class': 'modal' }, [
			E('h4', title),
			E('div', { 'class': 'modal-body' }, children)
		]);
		var overlay = E('div', {
			'class': 'morok-modal-overlay',
			style: 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;' +
				'align-items:center;justify-content:center;z-index:1000'
		}, modal);
		overlay.id = 'morok-modal';
		document.body.appendChild(overlay);
	},
	hideModal: function() {
		var m = document.getElementById('morok-modal');
		if (m) m.remove();
	},
	addNotification: function(title, node, type) {
		var n = E('div', {
			style: 'position:fixed;top:14px;right:14px;z-index:1100;background:#171c28;' +
				'border:1px solid rgba(255,255,255,.11);border-radius:10px;padding:10px 14px;' +
				'color:#e8ebf2;font-size:13px;max-width:360px'
		}, node);
		document.body.appendChild(n);
		setTimeout(function() { n.remove(); }, 4000);
	},
	addTimeLimitedNotification: function(title, node, ms) {
		this.addNotification(title, node);
	}
};
window.ui = ui; /* common.js зовёт window.ui напрямую */

/* ---------- poll: для скриншотов прогоняем колбэк один раз
   (в LuCI первый тик заполняет «живые» значения: дашборд статы/метрики) ---------- */
var poll = {
	add: function(fn) { setTimeout(function() { try { fn(); } catch (e) {} }, 120); return 0; },
	remove: function() {},
	start: function() {},
	stop: function() {}
};

/* ---------- uci: маркет зовёт load() в load(), остальное — по кликам;
   get() читает window.MOROK_MOCK_UCI ('<cfg>.<sid>.<opt>') из mock-data ---------- */
var __uciN = 0;
var uci = {
	load: function() { return Promise.resolve(true); },
	save: function() { return Promise.resolve(true); },
	add: function() { return 'cfg' + (++__uciN) + 'mock'; },
	set: function() { return true; },
	get: function(cfg, sid, opt) {
		var m = window.MOROK_MOCK_UCI || {};
		if (opt == null) return m[cfg + '.' + sid] != null ? 'section' : null;
		var v = m[cfg + '.' + sid + '.' + opt];
		return v != null ? v : null;
	}
};

/* ---------- загрузчик модулей по 'require'-директивам ---------- */
var MODULES = {
	'baseclass': baseclass,
	'view': view,
	'ui': ui,
	'rpc': rpc,
	'poll': poll,
	'uci': uci
};

function __parseRequires(src) {
	var reqs = [];
	var re = /^\s*'require\s+([a-z0-9_.]+)(?:\s+as\s+([A-Za-z_$][\w$]*))?';\s*$/gm;
	var m;
	while ((m = re.exec(src)) !== null) {
		var varName = m[2] || m[1].split('.').pop();
		reqs.push({ mod: m[1], varName: varName });
	}
	return reqs;
}

async function __evalModule(url, extraModules) {
	var src = await (await fetch(url)).text();
	var reqs = __parseRequires(src);
	var mods = Object.assign({}, MODULES, extraModules || {});
	var names = [], values = [];
	reqs.forEach(function(r) {
		if (!(r.mod in mods)) throw new Error('shim: модуль не замокан: ' + r.mod + ' (' + url + ')');
		names.push(r.varName);
		values.push(mods[r.mod]);
	});
	var factory = new Function(names.join(','), src + '\n//# sourceURL=' + url);
	var res = factory.apply(null, values);
	/* LuCI при require инстанцирует модуль-класс (baseclass.extend) */
	if (typeof res === 'function') res = new res();
	return res;
}

window.MorokShim = {
	/* common.js нужен вьюхам как 'morok.common'; грузим один раз.
	   Перед ним — 'morok.i18n' (common делает 'require morok.i18n') */
	loadCommon: async function(url, i18nUrl) {
		if (!MODULES['morok.i18n'] && i18nUrl)
			MODULES['morok.i18n'] = await __evalModule(i18nUrl);
		if (!MODULES['morok.common'])
			MODULES['morok.common'] = await __evalModule(url);
		return MODULES['morok.common'];
	},
	loadView: function(url) {
		return __evalModule(url);
	}
};
