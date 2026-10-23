'use strict';
'require view';
'require ui';
'require uci';
'require rpc';
'require morok.common as fn';

/* Маркет пресетов (Wave 5 UX-проход поверх Wave 4.2): каталог кураторских
   наборов правил/списков из ubus morok market.
   Что добавлено волной 5:
   - группировка карточек по категориям (Видео / Мессенджеры и соцсети /
     AI-сервисы / Списки сообщества): берём p.category, если backend начнёт
     отдавать, иначе — карта известных id + эвристика (preset с источниками —
     это «список сообщества»);
   - детальная модалка пресета: человеческое описание каждого правила
     (что матчится, куда пойдёт трафик), источники с URL, профиль
     оптимизации со ссылкой на страницу «Оптимизация»;
   - состояния: «не установлен» / «частично» / «✓ установлен» /
     «обновился в канале». Версии: если в пресете есть поле version,
     запоминаем её при установке (localStorage на админ-машине) — при
     расхождении показываем «обновился: vX → vY» и кнопку «Обновить»
     (повторная установка: дедупликация пропустит имеющееся, доустановит
     новое). Постоянный учёт версий — предложение для backend (W5_NOTES).
   Установка одним кликом (как было):
   - source_list-правила → add_rule (контракт: match = id источника);
   - geosite/custom-правила → прямая запись UCI-секции rule
     (add_rule принимает только строку match и всегда создаёт custom
     domain_suffix-правило: geosite-имя «youtube» стало бы бесполезным
     доменом «*.youtube», а adaptive-флаг потерялся бы — поэтому
     для них ubus uci; ACL luci-app-morok покрывает uci morok);
   - недостающие источники → тоже UCI (add_source в rpcd пока нет),
     после коммита — update_source, чтобы список скачался сразу;
   - профиль оптимизации из пресета → set_antidpi (best-effort);
   - в конце — apply.
   Дедупликация: правило/источник с таким label (или source_list-правило
   на тот же источник) уже есть — пропускаем, это видно в модалке.
   Если backend ещё не отдаёт market — страница показывает заглушку. */

var uciCommit = rpc.declare({ object: 'uci', method: 'commit', params: [ 'config' ] });

/* ---------- категории ---------- */
var CATEGORY_ORDER = [ 'video', 'social', 'ai', 'lists', 'other' ];
var CATEGORY_INFO = {
	video:  { title: '📺 Видео и стриминг', sub: 'YouTube, TikTok и другие видеосервисы' },
	social: { title: '💬 Мессенджеры и соцсети', sub: 'Discord, Meta и другие' },
	ai:     { title: '🤖 AI-сервисы', sub: 'ChatGPT, Copilot и другие' },
	lists:  { title: '📋 Списки сообщества', sub: 'большие готовые подборки доменов — скачиваются и обновляются автоматически' },
	other:  { title: '📦 Другое', sub: '' }
};
/* известные id → категория (пока backend не отдаёт p.category) */
var CATEGORY_BY_ID = {
	youtube: 'video', tiktok: 'video', twitch: 'video', rutube: 'video',
	discord: 'social', meta: 'social', instagram: 'social', telegram: 'social',
	chatgpt: 'ai', copilot: 'ai', claude: 'ai', gemini: 'ai', openai: 'ai'
};

/* ---------- человеческие описания ---------- */
var MATCH_TYPE_HUMAN = {
	geosite: 'встроенный список доменов сервиса',
	geosite_geoip: 'встроенный список (домены + IP-диапазоны)',
	custom: 'набор доменов из пресета',
	source_list: 'внешний список сообщества (скачается и будет обновляться)',
	final: 'всё остальное'
};
var ACTION_HUMAN = {
	proxy: 'трафик пойдёт через VPN',
	antidpi: 'оптимизация доставки — напрямую, без VPN',
	direct: 'трафик пойдёт напрямую',
	block: 'трафик будет заблокирован'
};

function verKey(id) { return 'morok_market_v1_' + id; }

return view.extend({
	presets: [],
	rules: [],
	sources: [],

	load: function() {
		return Promise.all([
			L.resolveDefault(fn.call.market(), null),
			L.resolveDefault(fn.call.rules(), { rules: [] }),
			L.resolveDefault(fn.call.sources(), { sources: [] }),
			L.resolveDefault(uci.load('morok'), null)
		]);
	},

	normL: function(s) { return String(s || '').trim().toLowerCase(); },

	presetCategory: function(p) {
		if (typeof p.category === 'string' && CATEGORY_INFO[p.category]) return p.category;
		if (CATEGORY_BY_ID[p.id]) return CATEGORY_BY_ID[p.id];
		if (Array.isArray(p.sources) && p.sources.length > 0) return 'lists';
		return 'other';
	},

	/* версия пресета, которую мы установили (localStorage админ-машины) */
	installedVersion: function(id) {
		try { return localStorage.getItem(verKey(id)); } catch (e) { return null; }
	},
	rememberVersion: function(p) {
		if (!p.version) return;
		try { localStorage.setItem(verKey(p.id), String(p.version)); } catch (e) {}
	},

	/* источник уже подключён? — по label (без регистра) или по url */
	findSource: function(label, url) {
		var self = this, found = null;
		(this.sources || []).forEach(function(s) {
			if (found) return;
			if (label && self.normL(s.label) === self.normL(label)) found = s;
			else if (url && s.url && self.normL(s.url) === self.normL(url)) found = s;
		});
		return found;
	},

	/* правило уже есть? — по label (без регистра); для source_list-правил
	   дополнительно по привязке к тому же источнику (label может отличаться) */
	ruleExists: function(rule) {
		var nl = this.normL(rule.label);
		var srcL = this.normL(rule.source);
		var srcId = null;
		if (rule.source) {
			var s = this.findSource(rule.source, null);
			if (s) srcId = s.id;
		}
		var yes = false;
		(this.rules || []).forEach(function(r) {
			if (yes) return;
			if (String(r.label || '').trim().toLowerCase() === nl) yes = true;
			else if (srcL && r.match_type === 'source_list' &&
				(this.normL(r.source) === srcL || (srcId && r.source === srcId))) yes = true;
		}, this);
		return yes;
	},

	/* состояние пресета относительно текущего конфига:
	   installed — все правила уже есть; partial — часть есть;
	   updated — установлен, но в канале новее версия (поле version) */
	presetState: function(p) {
		var rules = Array.isArray(p.rules) ? p.rules : [];
		var have = 0;
		rules.forEach(function(r) { if (this.ruleExists(r)) have++; }, this);
		var installed = rules.length > 0 && have === rules.length;
		var updated = false;
		if (installed && p.version) {
			var iv = this.installedVersion(p.id);
			if (iv && iv !== String(p.version)) updated = true;
		}
		return {
			installed: installed,
			partial: have > 0 && have < rules.length,
			updated: updated,
			installedVer: installed ? this.installedVersion(p.id) : null
		};
	},

	/* ---------- установка ---------- */

	/* строка-шаг в модалке прогресса */
	stepRow: function(text) {
		var ico = E('span', { 'class': 'fn-spin' });
		var row = E('div', { 'class': 'fn-istep' }, [ ico, E('span', text) ]);
		return {
			row: row,
			done: function(ok, note) {
				var repl = E('span', { 'class': 'fn-istep-ico ' + (ok ? 'ok' : 'fail') }, ok ? '✓' : '✗');
				row.replaceChild(repl, ico);
				if (note) row.appendChild(E('span', { 'class': 'fn-istep-note' }, note));
			},
			skip: function(note) {
				var repl = E('span', { 'class': 'fn-istep-ico skip' }, '⏭');
				row.replaceChild(repl, ico);
				if (note) row.appendChild(E('span', { 'class': 'fn-istep-note' }, note));
			}
		};
	},

	/* id источника по label пресета: среди существующих, либо
	   переспрашиваем backend после коммита новых источников */
	resolveSourceId: function(label, url) {
		var s = this.findSource(label, url);
		if (s) return Promise.resolve(s.id);
		return L.resolveDefault(fn.call.sources(), null).then(function(res) {
			var list = (res && Array.isArray(res.sources)) ? res.sources : [];
			var found = null;
			list.forEach(function(x) {
				if (found) return;
				if (label && String(x.label || '').trim().toLowerCase() === String(label || '').trim().toLowerCase()) found = x;
				else if (url && x.url === url) found = x;
			});
			return found ? found.id : null;
		});
	},

	/* последовательный прогон установки; report честно фиксирует,
	   что встало, что пропущено, что упало (частичная установка) */
	installPreset: function(p, logBox, doneBtn) {
		var self = this;
		var rep = { srcAdded: 0, srcReused: 0, rulesAdded: 0, rulesSkipped: 0, failed: [] };
		var uciDirty = false;      /* staged в uci — надо save+commit */
		var newSrcDefs = [];       /* источники, добавленные через uci: докачать после коммита */
		var seq = Promise.resolve();
		function step(text, fnRun) {
			var st = self.stepRow(text);
			logBox.appendChild(st.row);
			seq = seq.then(function() {
				return fnRun(st).then(null, function(err) {
					rep.failed.push(text);
					st.done(false, String(err || fn._t('ошибка')));
				});
			});
		}

		/* 1. источники */
		(p.sources || []).forEach(function(src) {
			var exist = self.findSource(src.label, src.url);
			if (exist) {
				step(fn._t('Список «%s»', src.label || exist.label), function(st) {
					rep.srcReused++;
					if (exist.enabled) { st.skip(fn._t('уже подключён')); return Promise.resolve(); }
					/* выключенный источник включаем — иначе правила по нему мёртвые */
					return fn.call.setSource(exist.id, true, exist.url || '', exist.update_interval || 0).then(function(res) {
						if (res && res.ok === false) throw res.error || fn._t('не включился');
						st.done(true, fn._t('был выключен — включили'));
					});
				});
				return;
			}
			step(fn._t('Список «%s» — добавление', src.label || src.url), function(st) {
				var sid = uci.add('morok', 'source');
				if (!sid) throw fn._t('uci.add не удался');
				uci.set('morok', sid, 'label', src.label || src.url);
				uci.set('morok', sid, 'url', src.url);
				uci.set('morok', sid, 'enabled', '1');
				uci.set('morok', sid, 'update_interval', String(src.update_interval || 86400));
				uciDirty = true;
				newSrcDefs.push(src);
				rep.srcAdded++;
				st.done(true, fn._t('скачается после применения'));
				return Promise.resolve();
			});
		});

		/* 2. правила */
		(p.rules || []).forEach(function(rule) {
			if (self.ruleExists(rule)) {
				step(fn._t('Правило «%s»', rule.label), function(st) {
					rep.rulesSkipped++;
					st.skip(fn._t('уже есть — не дублируем'));
					return Promise.resolve();
				});
				return;
			}
			if (rule.source) {
				/* source_list — через контрактный add_rule (match = id источника) */
				step(fn._t('Правило «%s»', rule.label), function(st) {
					var srcDef = null;
					(p.sources || []).forEach(function(s) {
						if (!srcDef && (self.normL(s.label) === self.normL(rule.source) || s.url === rule.source)) srcDef = s;
					});
					return self.resolveSourceId(srcDef ? srcDef.label : rule.source, srcDef ? srcDef.url : null).then(function(id) {
						if (!id) {
							/* источник свежедобавлен через uci и ещё не закоммичен —
							   дописываем правило тоже через uci, со ссылкой по label */
							if (srcDef && newSrcDefs.indexOf(srcDef) !== -1) {
								var sid2 = uci.add('morok', 'rule');
								if (!sid2) throw fn._t('uci.add не удался');
								uci.set('morok', sid2, 'label', rule.label);
								uci.set('morok', sid2, 'match_type', 'source_list');
								uci.set('morok', sid2, 'source', rule.source);
								uci.set('morok', sid2, 'action', rule.action || 'proxy');
								uci.set('morok', sid2, 'enabled', '1');
								uciDirty = true;
								rep.rulesAdded++;
								st.done(true);
								return;
							}
							throw fn._t('источник «%s» не найден', rule.source);
						}
						return fn.call.addRule(rule.label, id, rule.action || 'proxy').then(function(res) {
							if (res && res.ok === false) throw res.error || fn._t('не добавилось');
							rep.rulesAdded++;
							st.done(true);
						});
					});
				});
				return;
			}
			/* geosite/custom — прямая UCI-секция: сохраняем match_type,
			   весь массив match и adaptive (add_rule этого не умеет) */
			step(fn._t('Правило «%s»', rule.label), function(st) {
				var mt = rule.match_type || 'custom';
				var match = Array.isArray(rule.match) ? rule.match : [];
				if (!match.length) { st.skip(fn._t('пустой match — нечего добавлять')); return Promise.resolve(); }
				var sid = uci.add('morok', 'rule');
				if (!sid) throw fn._t('uci.add не удался');
				uci.set('morok', sid, 'label', rule.label);
				uci.set('morok', sid, 'match_type', mt);
				uci.set('morok', sid, 'match', match);
				uci.set('morok', sid, 'action', rule.action || 'proxy');
				if (rule.adaptive) uci.set('morok', sid, 'adaptive', '1');
				uci.set('morok', sid, 'enabled', '1');
				uciDirty = true;
				rep.rulesAdded++;
				st.done(true, mt + (rule.action === 'antidpi' ? fn._t(' · ⚡ оптимизация') : '') +
					(rule.adaptive ? fn._t(' · адаптивное') : ''));
				return Promise.resolve();
			});
		});

		/* 3. коммит staged-изменений uci (источники + geosite/custom правила) */
		step(fn._t('Сохраняю конфиг'), function(st) {
			if (!uciDirty) { st.skip(fn._t('нечего коммитить')); return Promise.resolve(); }
			return uci.save().then(function() {
				return L.resolveDefault(uciCommit('morok'), null);
			}).then(function(res) {
				if (res === null) throw fn._t('ubus uci commit недоступен');
				st.done(true);
			});
		});

		/* 4. докачать свежие списки, чтобы правила не стартовали пустыми */
		step(fn._t('Запускаю скачивание новых списков'), function(st) {
			if (!newSrcDefs.length) { st.skip(fn._t('новых списков нет')); return Promise.resolve(); }
			var q = Promise.resolve();
			newSrcDefs.forEach(function(src) {
				q = q.then(function() {
					return self.resolveSourceId(src.label, src.url).then(function(id) {
						if (id) L.resolveDefault(fn.call.updateSource(id), null);
					});
				});
			});
			return q.then(function() { st.done(true, fn._t('в фоне')); });
		});

		/* 5. профиль оптимизации из пресета — best-effort */
		if (p.antidpi_strategy) {
			step(fn._t('Профиль оптимизации: %s', p.antidpi_strategy), function(st) {
				return L.resolveDefault(fn.call.setAntidpi(p.antidpi_strategy), null).then(function(res) {
					if (res === null) { st.skip(fn._t('set_antidpi недоступен — пропускаем')); return; }
					if (res && res.ok === false) { st.done(false, res.error || fn._t('не применилась')); return; }
					st.done(true);
				});
			});
		}

		/* 6. применить конфиг */
		step(fn._t('Применяю конфиг (apply)'), function(st) {
			return fn.call.apply().then(function(res) {
				if (res && res.ok === false) throw res.error || fn._t('apply не удался');
				st.done(true);
			});
		});

		seq.then(function() {
			doneBtn.disabled = false;
			var parts = [];
			if (rep.rulesAdded) parts.push(fn._t('правил: %s', rep.rulesAdded));
			if (rep.srcAdded) parts.push(fn._t('списков: %s', rep.srcAdded));
			if (rep.rulesSkipped || rep.srcReused)
				parts.push(fn._t('пропущено как уже имеющиеся: %s', rep.rulesSkipped + rep.srcReused));
			if (rep.failed.length) {
				ui.addNotification(null, E('p',
					fn._t('«%s»: установлено частично%s. Не встало: %s', p.label,
						parts.length ? ' (' + parts.join(', ') + ')' : '',
						rep.failed.join('; '))), 'warning');
			} else {
				/* запоминаем версию, чтобы потом показать «обновился в канале» */
				self.rememberVersion(p);
				ui.addNotification(null, E('p',
					fn._t('Пресет «%s» установлен%s', p.label,
						parts.length ? ' — ' + parts.join(', ') : '')));
			}
		});
		return seq;
	},

	/* ---------- детальная модалка пресета ---------- */

	/* человеческое описание правила: что матчится и куда пойдёт */
	describeRule: function(rule) {
		var mt = rule.match_type || 'custom';
		var match = Array.isArray(rule.match) ? rule.match : [];
		var what = fn._t(MATCH_TYPE_HUMAN[mt] || mt);
		if (mt === 'custom' && match.length)
			what = fn._p(match.length,
				[ '%s домен', '%s домена', '%s доменов' ],
				[ '%s domain', '%s domains' ]) + fn._t(' из пресета');
		if (mt === 'geosite' && match.length)
			what += ' «' + match.join(', ') + '»';
		var where = fn._t(ACTION_HUMAN[rule.action || 'proxy'] || rule.action);
		return { what: what, where: where };
	},

	showDetail: function(p) {
		var self = this;
		var rules = Array.isArray(p.rules) ? p.rules : [];
		var srcs = Array.isArray(p.sources) ? p.sources : [];
		var st = this.presetState(p);

		/* что внутри: правила */
		var ruleKids = [];
		rules.forEach(function(r) {
			var d = self.describeRule(r);
			var match = Array.isArray(r.match) ? r.match : [];
			var rowKids = [
				E('span', { 'class': 'fn-ic-ico' }, '🧭'),
				E('span', { 'class': 'fn-ic-name' }, [
					r.label,
					r.adaptive ? E('span', { 'class': 'fn-badge violet', style: 'margin-left:7px' }, fn._t('со сторожем')) : ''
				]),
				fn.actBadge(r.action, r.adaptive)
			];
			var row = E('div', { 'class': 'fn-icrow', style: 'flex-wrap:wrap' }, rowKids);
			ruleKids.push(row);
			ruleKids.push(E('div', { 'class': 'fn-pd-match', style: 'padding:0 14px 7px' },
				d.what + ' → ' + d.where +
				(r.adaptive ? fn._t('; если оптимизация деградирует — правило временно уйдёт в VPN и вернётся само') : '')));
			if (r.match_type === 'custom' && match.length > 3)
				ruleKids.push(E('div', { 'class': 'fn-pd-match', style: 'padding:0 14px 7px;opacity:.65' },
					match.slice(0, 6).join(', ') + (match.length > 6 ? fn._t(' и ещё %s', match.length - 6) : '')));
		});

		var blocks = [];
		if (p.description)
			blocks.push(E('div', { 'class': 'fn-card-sub' }, p.description));

		/* мета: версия, категория */
		var metaKids = [];
		if (p.version)
			metaKids.push(E('span', { 'class': 'fn-pill dim' }, fn._t('версия %s', p.version)));
		var cat = CATEGORY_INFO[this.presetCategory(p)];
		if (cat) metaKids.push(E('span', { 'class': 'fn-pill dim' }, fn._t(cat.title)));
		if (st.installed)
			metaKids.push(E('span', { 'class': 'fn-pill g' }, fn._t('✓ установлен')));
		if (metaKids.length)
			blocks.push(E('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:9px' }, metaKids));

		blocks.push(E('div', { 'class': 'fn-pd-block' }, [
			E('div', { 'class': 'fn-pd-title' }, fn._t('Что внутри — правила (%s)', rules.length)),
			E('div', { 'class': 'fn-icompose' }, ruleKids)
		]));

		if (srcs.length) {
			var srcKids = [];
			srcs.forEach(function(s) {
				srcKids.push(E('div', { 'class': 'fn-icrow', style: 'flex-wrap:wrap' }, [
					E('span', { 'class': 'fn-ic-ico' }, '📋'),
					E('span', { 'class': 'fn-ic-name' }, s.label || s.url)
				]));
				srcKids.push(E('div', { 'class': 'fn-pd-match', style: 'padding:0 14px 7px;opacity:.65' },
					s.url + ' · ' + fn._t('обновление каждые %s ч', Math.round((s.update_interval || 86400) / 3600))));
			});
			blocks.push(E('div', { 'class': 'fn-pd-block' }, [
				E('div', { 'class': 'fn-pd-title' }, fn._t('Источники списков (%s)', srcs.length)),
				E('div', { 'class': 'fn-icompose' }, srcKids)
			]));
		}

		if (p.antidpi_strategy)
			blocks.push(E('div', { 'class': 'fn-pd-block' }, [
				E('div', { 'class': 'fn-pd-title' }, fn._t('Профиль оптимизации')),
				E('div', { 'class': 'fn-card-sub' }, [
					fn._t('Пресет переключит профиль оптимизации на «%s». Тонкая настройка — на странице ', p.antidpi_strategy),
					E('a', { href: L.url('admin/services/morok/antidpi'), click: function() { ui.hideModal(); } }, fn._t('Оптимизация')),
					'.'
				])
			]));

		/* установка: состав с дедуп-пометками + прогресс */
		var list = E('div', { 'class': 'fn-icompose' });
		srcs.forEach(function(s) {
			var exist = self.findSource(s.label, s.url);
			list.appendChild(E('div', { 'class': 'fn-icrow' }, [
				E('span', { 'class': 'fn-ic-ico' }, '📋'),
				E('span', { 'class': 'fn-ic-name' }, fn._t('Список: %s', s.label || s.url)),
				E('span', { 'class': 'fn-pill ' + (exist ? 'dim' : 'b') }, exist ? fn._t('уже подключён') : fn._t('новый'))
			]));
		});
		rules.forEach(function(r) {
			var exist = self.ruleExists(r);
			var kids = [
				E('span', { 'class': 'fn-ic-ico' }, '🧭'),
				E('span', { 'class': 'fn-ic-name' }, r.label),
				fn.actBadge(r.action, r.adaptive),
				E('span', { 'class': 'fn-pill ' + (exist ? 'dim' : 'b') }, exist ? fn._t('уже есть') : fn._t('новое'))
			];
			list.appendChild(E('div', { 'class': 'fn-icrow' }, kids));
		});

		blocks.push(E('div', { 'class': 'fn-pd-block' }, [
			E('div', { 'class': 'fn-pd-title' }, st.installed ? fn._t('Что будет при повторной установке') : fn._t('Что будет установлено')),
			list,
			E('div', { 'class': 'fn-card-sub', style: 'margin-top:8px;opacity:.7' },
				fn._t('Что уже есть в конфиге — пропустим, дублей не будет. После добавления конфиг применится автоматически (apply).'))
		]));

		var goBtn = E('button', { 'class': 'fn-btn primary' },
			st.updated ? fn._t('🔄 Обновить') : st.installed ? fn._t('🔄 Установить заново') : fn._t('🛒 Установить'));
		var logBox = E('div', { 'class': 'fn-ilog', style: 'display:none' });
		goBtn.addEventListener('click', function() {
			goBtn.disabled = true;
			logBox.style.display = '';
			self.installPreset(p, logBox, goBtn).then(function() {
				setTimeout(function() { location.reload(); }, 2500);
			});
		});

		blocks.push(logBox);
		blocks.push(E('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
			E('button', { 'class': 'fn-btn', click: ui.hideModal }, fn._t('Закрыть')),
			goBtn
		]));

		ui.showModal((p.emoji || '🛒') + ' ' + (p.label || fn._t('Пресет')), blocks);
	},

	/* ---------- карточки ---------- */

	presetCard: function(p) {
		var self = this;
		var rules = Array.isArray(p.rules) ? p.rules : [];
		var srcs = Array.isArray(p.sources) ? p.sources : [];
		var st = this.presetState(p);

		/* действия правил пресета — компактными бейджами */
		var acts = [];
		var seen = {};
		rules.forEach(function(r) {
			var a = r.action || 'proxy';
			if (seen[a]) return;
			seen[a] = true;
			acts.push(fn.actBadge(a, r.adaptive));
		});

		var nameKids = [ p.label || p.id || '?' ];
		if (st.updated)
			nameKids.push(E('span', { 'class': 'fn-badge reco' },
				fn._t('обновился: v%s → v%s', st.installedVer, p.version)));
		else if (st.installed)
			nameKids.push(E('span', { 'class': 'fn-pill g' }, fn._t('✓ установлен')));
		else if (st.partial)
			nameKids.push(E('span', { 'class': 'fn-pill y' }, fn._t('частично')));

		var metaKids = [
			E('span', { 'class': 'fn-pill dim' }, fn._p(rules.length,
				[ '%s правило', '%s правила', '%s правил' ],
				[ '%s rule', '%s rules' ]))
		];
		if (srcs.length)
			metaKids.push(E('span', { 'class': 'fn-pill dim' }, fn._p(srcs.length,
				[ '%s список', '%s списка', '%s списков' ],
				[ '%s list', '%s lists' ])));
		if (p.version)
			metaKids.push(E('span', { 'class': 'fn-pill dim' }, 'v' + p.version));
		acts.forEach(function(a) { metaKids.push(a); });

		var detailBtn = E('button', { 'class': 'fn-btn sm' }, fn._t('Подробнее'));
		detailBtn.addEventListener('click', function() { self.showDetail(p); });

		var actBtn;
		if (st.installed && !st.updated) {
			actBtn = E('button', { 'class': 'fn-btn sm', disabled: 'disabled' }, fn._t('✓ Установлен'));
		} else {
			actBtn = E('button', { 'class': 'fn-btn sm primary' },
				st.updated ? fn._t('🔄 Обновить') : st.partial ? fn._t('Доустановить') : fn._t('🛒 Установить'));
			actBtn.addEventListener('click', function() { self.showDetail(p); });
		}

		return E('div', { 'class': 'fn-preset' + (st.installed && !st.updated ? ' installed' : '') }, [
			E('div', { 'class': 'fn-preset-head' }, [
				E('div', { 'class': 'fn-preset-emoji' }, p.emoji || '📦'),
				E('div', { style: 'flex:1;min-width:0' }, [
					E('div', { 'class': 'fn-preset-name' }, nameKids),
					E('div', { 'class': 'fn-preset-desc' }, p.description || '')
				])
			]),
			E('div', { 'class': 'fn-preset-meta' }, metaKids),
			E('div', { 'class': 'fn-preset-foot' }, [ detailBtn, actBtn ])
		]);
	},

	renderBody: function(box, marketRes) {
		var self = this;
		box.textContent = '';
		if (marketRes === null) {
			box.appendChild(fn.unavailCard(fn._t('Маркет пресетов')));
			return;
		}
		this.presets = Array.isArray(marketRes.presets) ? marketRes.presets : [];
		if (!this.presets.length) {
			box.appendChild(E('div', { 'class': 'fn-card' }, [
				E('div', { 'class': 'fn-rowitem', style: 'border:none;padding:4px 0' }, [
					E('span', { 'class': 'fn-dot y' }),
					E('div', [
						E('div', { 'class': 'fn-rowname' }, fn._t('Каталог пуст')),
						E('div', { 'class': 'fn-card-sub' }, fn._t('Backend ответил, но пресетов не прислал — попробуйте обновить позже.'))
					])
				])
			]));
			return;
		}

		/* группировка по категориям, порядок — CATEGORY_ORDER */
		var byCat = {};
		this.presets.forEach(function(p) {
			var c = self.presetCategory(p);
			if (!byCat[c]) byCat[c] = [];
			byCat[c].push(p);
		});
		CATEGORY_ORDER.forEach(function(catKey) {
			var list = byCat[catKey];
			if (!list || !list.length) return;
			var info = CATEGORY_INFO[catKey];
			box.appendChild(E('div', { 'class': 'fn-mcat' }, [
				fn._t(info.title),
				E('span', { 'class': 'cnt' }, String(list.length)),
				info.sub ? E('span', { 'class': 'sub' }, fn._t(info.sub)) : ''
			]));
			var grid = E('div', { 'class': 'fn-market-grid' });
			list.forEach(function(p) { grid.appendChild(self.presetCard(p)); });
			box.appendChild(grid);
		});
	},

	render: function(data) {
		fn.loadCSS();
		var marketRes = data[0];
		this.rules = (data[1] || {}).rules || [];
		this.sources = (data[2] || {}).sources || [];

		var box = E('div', [ fn.skelRows(3) ]);
		var root = E('div', [
			E('div', { 'class': 'fn-card', style: 'margin-bottom:14px' }, [
				E('div', { 'class': 'fn-card-title' }, fn._t('🛒 Маркет пресетов')),
				E('div', { 'class': 'fn-card-sub' },
					fn._t('Готовые наборы правил по категориям: выберите сервис → «Подробнее» покажет, что именно добавится и куда пойдёт трафик → «Установить» сделает всё за один клик. Уже имеющиеся правила не дублируются.'))
			]),
			box
		]);

		this.renderBody(box, marketRes);

		return fn.page('market', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
