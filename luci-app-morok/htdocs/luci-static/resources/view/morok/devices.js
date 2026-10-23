'use strict';
'require view';
'require ui';
'require morok.common as fn';

/* Устройства (Wave 1, задача 1.1): per-device маршрутизация по MAC.
   Контракт бэкенда (ubus morok devices):
     { devices: [ { mac, ip, hostname/label, online, route, enabled } ] }
   route: follow | direct | proxy | node:<id>
   Запись: set_device { mac, route, label, enabled }, удаление: del_device { mac }. */

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fn.call.devices(), null),
			L.resolveDefault(fn.call.nodes(), { nodes: [] })
		]);
	},

	routeSelect: function(d, nodes) {
		var sel = E('select', { 'class': 'fn-route-sel' });
		var cur = d.route || 'follow';
		function opt(v, t) {
			var o = E('option', { value: v }, t);
			if (v === cur) o.selected = true;
			sel.appendChild(o);
		}
		opt('follow', fn._t('Следовать правилам'));
		opt('direct', fn._t('Напрямую'));
		opt('proxy', fn._t('Всегда VPN'));
		(nodes || []).forEach(function(n) {
			if (n.enabled) opt('node:' + n.id, '➤ ' + n.label);
		});
		// маршрут на ноду, которой больше нет в пуле — показываем как есть
		if (cur.indexOf('node:') === 0 && !sel.querySelector('option[value="' + cur + '"]'))
			opt(cur, '➤ ' + cur.slice(5) + fn._t(' (недоступна)'));
		sel.addEventListener('change', function() {
			sel.disabled = true;
			fn.call.setDevice(d.mac, sel.value, d.label || '', d.enabled !== false).then(function(res) {
				sel.disabled = false;
				if (res && res.ok === false) { fn.notify(res.error || fn._t('Не удалось сохранить маршрут')); return; }
				fn.notify(fn._t('%s: маршрут сохранён', d.label || d.hostname || d.mac));
			})['catch'](function() {
				sel.disabled = false;
				fn.notify(fn._t('Метод set_device пока недоступен'));
			});
		});
		return sel;
	},

	deviceRow: function(d, nodes) {
		var name = d.label || d.hostname || d.name || d.mac;
		var online = !!d.online;
		var enabled = d.enabled !== false;
		var row = E('div', { 'class': 'fn-rowitem' + (enabled ? '' : ' off') }, [
			E('span', {
				'class': 'fn-dot ' + (online ? 'g' : 'dim'),
				title: online ? fn._t('онлайн') : fn._t('офлайн')
			}),
			E('div', { style: 'flex:1;min-width:0' }, [
				E('div', { 'class': 'fn-rowname' }, name),
				E('div', { 'class': 'fn-rowsub' },
					(d.ip ? d.ip + ' · ' : '') + String(d.mac || '').toLowerCase())
			]),
			E('div', { style: 'margin-left:auto;display:flex;align-items:center;gap:12px;flex-shrink:0' }, [
				this.routeSelect(d, nodes),
				fn.toggle(enabled, false, function(on) {
					fn.call.setDevice(d.mac, d.route || 'follow', d.label || '', on).then(function(res) {
						if (res && res.ok === false) { fn.notify(res.error || fn._t('Не удалось переключить')); return; }
						row.classList.toggle('off', !on);
						fn.notify(name + ': ' + (on ? fn._t('правило вкл') : fn._t('правило выкл')));
					})['catch'](function() {
						fn.notify(fn._t('Метод set_device пока недоступен'));
					});
				}),
				E('button', {
					'class': 'fn-btn sm',
					title: fn._t('Убрать устройство из списка'),
					click: function() {
						if (!confirm(fn._t('Убрать устройство «%s» и его маршрут?', name))) return;
						fn.call.delDevice(d.mac).then(function(res) {
							if (res && res.ok === false) { fn.notify(res.error || fn._t('Не удалось удалить')); return; }
							fn.notify(fn._t('Устройство удалено'));
							row.remove();
						})['catch'](function() {
							fn.notify(fn._t('Метод del_device пока недоступен'));
						});
					}
				}, '🗑')
			])
		]);
		return row;
	},

	render: function(data) {
		fn.loadCSS();
		var self = this;
		var devRes = data[0];
		var nodes = ((data[1] || {}).nodes || []);

		var root = E('div');

		// метод ещё не реализован бэкендом
		if (devRes === null) {
			root.appendChild(fn.unavailCard(fn._t('Устройства')));
			return fn.page('devices', root);
		}

		var devices = devRes.devices || [];
		// бэкенд может прислать ноды для селектора прямо в devices
		if (devRes.nodes && devRes.nodes.length) nodes = devRes.nodes;

		var online = devices.filter(function(d) { return d.online; });
		var offline = devices.filter(function(d) { return !d.online; });

		root.appendChild(E('div', { 'class': 'fn-section' }, [
			fn._t('Устройства в сети'), E('span', { 'class': 'cnt' }, String(devices.length))
		]));

		if (devices.length === 0) {
			root.appendChild(E('div', { 'class': 'fn-card' }, [
				E('div', { 'class': 'fn-card-title' }, fn._t('Нет устройств')),
				E('div', { 'class': 'fn-card-sub' },
					fn._t('Появятся после подключения к роутеру — Морок подхватит их из DHCP-аренд автоматически.'))
			]));
		} else {
			root.appendChild(E('div', { 'class': 'fn-card fn-card-sub', style: 'margin-bottom:12px' },
				fn._t('Маршрут устройства важнее общих правил: «Всегда VPN» гонит весь трафик устройства через туннель, «Напрямую» — мимо него, конкретная нода — закрепляет устройство за ней.')));
			if (online.length) {
				var g1 = E('div', { 'class': 'fn-group' });
				online.forEach(function(d) { g1.appendChild(self.deviceRow(d, nodes)); });
				root.appendChild(g1);
			}
			if (offline.length) {
				root.appendChild(E('div', { 'class': 'fn-section' }, [
					fn._t('Офлайн'), E('span', { 'class': 'cnt' }, String(offline.length))
				]));
				var g2 = E('div', { 'class': 'fn-group' });
				offline.forEach(function(d) { g2.appendChild(self.deviceRow(d, nodes)); });
				root.appendChild(g2);
			}
		}

		return fn.page('devices', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
