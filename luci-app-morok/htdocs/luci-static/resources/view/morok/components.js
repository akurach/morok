'use strict';
'require view';
'require ui';
'require morok.common as fn';

/* Компоненты (Wave 2, задача 2.8; track B3): версии вендорных бинарей
   (sing-box, nfqws2, …) через ubus components. «Проверить обновления»
   дёргает check_update по каждому; если update_available — появляется
   «Обновить до X.Y» (update_component). «Откатить» (rollback) — если
   backend знает прошлую версию. Скелетон-загрузка, чтобы страница
   не висела пустой. Ошибки канала — человечески. */

return view.extend({
	comps: [],

	humanError: function(err) {
		var s = String(err || '').toLowerCase();
		if (s.indexOf('channel') !== -1 || s.indexOf('канал') !== -1 || s.indexOf('not configured') !== -1)
			return 'канал обновлений недоступен — проверьте соединение';
		return err || 'ошибка';
	},

	/* проверка обновления одного компонента (ubus check_update, W3_NOTES_D §3).
	   Состояния: «канал не настроен» (честная плашка/уведомление),
	   «есть обновление X→Y», «актуально». loud=true — с уведомлением. */
	checkComponent: function(c, loud) {
		var self = this;
		c._check = { checking: true };
		if (c._slot) self.compActions(c, c._slot);
		return L.resolveDefault(fn.call.checkUpdate(c.name), null).then(function(res) {
			if (res === null) {
				c._check = { error: 'метод check_update пока недоступен' };
				if (loud) fn.notify(c._check.error);
			} else if (res.ok === false || res.error) {
				c._check = { error: res.error || 'проверка не удалась' };
				if (loud) ui.addNotification(null, E('p', c.name + ': ' + self.humanError(c._check.error)), 'warning');
			} else {
				c._check = res;
				if (loud) {
					if (res.update_available && res.latest)
						ui.addNotification(null, E('p',
							'Доступно обновление «' + c.name + '»: ' + (res.current || c.version || '?') + ' → ' + res.latest));
					else
						fn.notify('«' + c.name + '»: версия ' + (res.current || c.version || '?') + ' актуальна');
				}
			}
			if (c._slot) self.compActions(c, c._slot);
		});
	},

	/* правая часть строки: кнопки/пилюли, перерисовывается после check_update */
	compActions: function(c, slot) {
		var self = this;
		slot.textContent = '';

		var st = c._check; // результат check_update
		if (st && st.checking) {
			slot.appendChild(E('span', { 'class': 'fn-metric checking' }, [
				E('span', { 'class': 'fn-spin' }),
				E('span', { 'class': 'm-val' }, 'проверяю…')
			]));
			return;
		}
		if (st && st.error) {
			slot.appendChild(E('span', { 'class': 'fn-pill y', title: String(st.error) },
				this.humanError(st.error)));
		} else if (st && st.update_available && st.latest) {
			slot.appendChild(E('span', { 'class': 'fn-pill y' },
				(st.current || c.version || '?') + ' → ' + st.latest));
			var updBtn = E('button', { 'class': 'fn-btn sm primary' }, '⬆ Обновить до ' + st.latest);
			updBtn.addEventListener('click', function() {
				updBtn.disabled = true;
				updBtn.textContent = '';
				updBtn.appendChild(E('span', { 'class': 'fn-spin' }));
				updBtn.appendChild(document.createTextNode(' Обновляю…'));
				fn.call.updateComponent(c.name).then(function(res) {
					if (res && res.ok === false) {
						updBtn.disabled = false;
						updBtn.textContent = '⬆ Обновить до ' + st.latest;
						fn.notify('«' + c.name + '»: ' + self.humanError(res.error));
						return;
					}
					fn.notify('«' + c.name + '» обновлён' + (res && res.version ? ' до ' + res.version : ''));
					setTimeout(function() { location.reload(); }, 1500);
				})['catch'](function() {
					updBtn.disabled = false;
					updBtn.textContent = '⬆ Обновить до ' + st.latest;
					fn.notify('Метод update_component пока недоступен');
				});
			});
			slot.appendChild(updBtn);
		} else if (st && st.ok !== false) {
			slot.appendChild(E('span', { 'class': 'fn-pill g' }, '✓ актуально'));
		}

		// откат — если backend знает прошлую версию
		var prev = c.previous_version || c.prev_version;
		if (prev) {
			var rbBtn = E('button', { 'class': 'fn-btn sm', title: 'Вернуть версию ' + prev }, '↩ Откатить');
			rbBtn.addEventListener('click', function() {
				if (!confirm('Откатить «' + c.name + '» к версии ' + prev + '?')) return;
				rbBtn.disabled = true;
				rbBtn.textContent = 'Откатываю…';
				fn.call.rollback(c.name).then(function(res) {
					if (res && res.ok === false) {
						rbBtn.disabled = false;
						rbBtn.textContent = '↩ Откатить';
						fn.notify('«' + c.name + '»: ' + (res.error || 'откат не удался'));
						return;
					}
					fn.notify('«' + c.name + '» откачен к ' + prev);
					setTimeout(function() { location.reload(); }, 1500);
				})['catch'](function() {
					rbBtn.disabled = false;
					rbBtn.textContent = '↩ Откатить';
					fn.notify('Метод rollback пока недоступен');
				});
			});
			slot.appendChild(rbBtn);
		}

		// покомпонентная проверка обновления (W3_NOTES_D: фрагмент для трека B)
		var chkBtn = E('button', { 'class': 'fn-btn sm', title: 'Спросить канал обновлений про этот компонент' }, '⟳ Проверить');
		chkBtn.addEventListener('click', function() { self.checkComponent(c, true); });
		slot.appendChild(chkBtn);
	},

	/* ---------- Wave 4 (4.1): карточка «Приложение Морок» ----------
	   app_check → {ok, current, latest, notes, error?},
	   app_update → {ok, version, log}. Если app_check reject'ится
	   (старый backend) — карточка честно сообщает про отсутствие
	   поддержки обновлений, кнопок обновления нет. */
	renderAppCard: function() {
		var self = this;
		var app = { phase: 'checking' }; // checking|unsupported|error|ok|update|updating|updated

		var verBadge = E('span', { 'class': 'fn-badge hl' }, '—');
		var noteEl = E('div', { 'class': 'fn-rowsub', style: 'display:none' });
		var actSlot = E('div', { style: 'display:flex;align-items:center;gap:8px;flex-shrink:0' });

		function paint() {
			actSlot.textContent = '';
			if (app.current) verBadge.textContent = app.current;
			if (app.phase === 'checking') {
				actSlot.appendChild(E('span', { 'class': 'fn-metric checking' }, [
					E('span', { 'class': 'fn-spin' }),
					E('span', { 'class': 'm-val' }, 'проверяю…')
				]));
				return;
			}
			if (app.phase === 'unsupported') {
				actSlot.appendChild(E('span', { 'class': 'fn-pill dim' },
					'backend без поддержки обновлений'));
				return;
			}
			if (app.phase === 'updating') {
				actSlot.appendChild(E('span', { 'class': 'fn-metric checking' }, [
					E('span', { 'class': 'fn-spin' }),
					E('span', { 'class': 'm-val' }, 'обновляю…')
				]));
				return;
			}
			if (app.phase === 'updated' || app.phase === 'maybe') {
				actSlot.appendChild(E('span', { 'class': 'fn-pill ' + (app.phase === 'updated' ? 'g' : 'y') },
					app.phase === 'updated'
						? '✓ обновлено' + (app.latest ? ' до ' + app.latest : '')
						: 'статус неизвестен — проверь после перезагрузки'));
				var rl = E('button', { 'class': 'fn-btn sm primary' }, '⟳ Обновить страницу');
				rl.addEventListener('click', function() { location.reload(); });
				actSlot.appendChild(rl);
				return;
			}
			if (app.phase === 'error') {
				actSlot.appendChild(E('span', { 'class': 'fn-pill y', title: String(app.error || '') },
					self.humanError(app.error || 'проверка не удалась')));
			} else if (app.phase === 'update') {
				actSlot.appendChild(E('span', { 'class': 'fn-pill y' },
					(app.current || '?') + ' → ' + app.latest));
				var upd = E('button', { 'class': 'fn-btn sm primary' }, '⬆ Обновить до ' + app.latest);
				upd.addEventListener('click', function() {
					if (!confirm('Обновить приложение Морок до версии ' + app.latest + '?\n\n' +
						'Во время обновления сервис перезапустится — туннель на минуту прервётся. ' +
						'После обновления страницу нужно будет перезагрузить (Ctrl+Shift+R).')) return;
					app.phase = 'updating';
					paint();
					fn.call.appUpdate().then(function(res) {
						if (res && res.ok === false) {
							app.phase = 'update';
							paint();
							fn.notify(self.humanError(res.error || 'обновление не удалось'));
							return;
						}
						app.phase = 'updated';
						if (res && res.version) { app.latest = res.version; app.current = res.version; }
						paint();
						fn.notify('Морок обновлён' + (res && res.version ? ' до ' + res.version : '') + ' — обнови страницу');
					})['catch'](function() {
						/* app_update может идти дольше rpctimeout (20с): процесс
						   на роутере при этом продолжается — честно говорим об этом */
						app.phase = 'maybe';
						paint();
						ui.addNotification(null, E('p',
							'Ответ от app_update не дождались (таймаут запроса) — обновление, скорее всего, ещё идёт на роутере. Вернись сюда через минуту и обнови страницу.'), 'warning');
					});
				});
				actSlot.appendChild(upd);
			} else if (app.phase === 'ok') {
				actSlot.appendChild(E('span', { 'class': 'fn-pill g' }, '✓ актуально'));
			}
			/* кнопка ручной проверки — во всех «живых» состояниях */
			var chk = E('button', { 'class': 'fn-btn sm', title: 'Спросить канал обновлений приложения' }, '⟳ Проверить');
			chk.addEventListener('click', function() { self.checkApp(app, paint, noteEl, true); });
			actSlot.appendChild(chk);
		}

		var card = E('div', { 'class': 'fn-card', style: 'margin-bottom:14px' }, [
			E('div', { 'class': 'fn-rowitem', style: 'border:none;padding:4px 0' }, [
				E('span', { 'class': 'fn-dot g' }),
				E('div', { style: 'flex:1;min-width:0' }, [
					E('div', { 'class': 'fn-rowname' }, [ 'Приложение Морок', ' ', verBadge ]),
					E('div', { 'class': 'fn-rowsub' },
						'LuCI-интерфейс + rpcd-backend одним пакетом. Обновление ставит новый ipk/apk из нашего канала.'),
					noteEl
				]),
				actSlot
			])
		]);

		/* тихая проверка при открытии страницы: сразу видно версию
		   и доступное обновление; старый backend — плашка unsupported */
		this.checkApp(app, paint, noteEl, false);
		return card;
	},

	checkApp: function(app, paint, noteEl, loud) {
		var self = this;
		app.phase = 'checking';
		paint();
		return L.resolveDefault(fn.call.appCheck(), null).then(function(res) {
			if (res === null) {
				app.phase = 'unsupported';
				if (loud) fn.notify('Метод app_check пока недоступен — backend без поддержки обновлений');
			} else if (res.ok === false || res.error) {
				app.phase = 'error';
				app.error = res.error || 'проверка не удалась';
				if (loud) ui.addNotification(null, E('p', 'Приложение Морок: ' + self.humanError(app.error)), 'warning');
			} else {
				app.current = res.current || app.current;
				app.latest = res.latest || null;
				app.error = null;
				var hasUpd = (res.update_available != null)
					? !!res.update_available
					: !!(res.latest && res.latest !== res.current);
				app.phase = hasUpd ? 'update' : 'ok';
				if (res.notes && hasUpd) {
					noteEl.style.display = '';
					noteEl.textContent = String(res.notes);
				} else {
					noteEl.style.display = 'none';
				}
				if (loud)
					fn.notify(hasUpd
						? 'Доступно обновление приложения: ' + (res.current || '?') + ' → ' + res.latest
						: 'Приложение актуально (' + (res.current || '?') + ')');
			}
			paint();
		});
	},

	compRow: function(c) {
		var self = this;
		var actSlot = E('div', { style: 'display:flex;align-items:center;gap:8px;flex-shrink:0' });
		var row = E('div', { 'class': 'fn-rowitem' }, [
			E('span', { 'class': 'fn-dot g' }),
			E('div', { style: 'flex:1;min-width:0' }, [
				E('div', { 'class': 'fn-rowname' }, [
					c.name || '?',
					' ',
					E('span', { 'class': 'fn-badge hl' }, c.version || '—')
				]),
				E('div', { 'class': 'fn-rowsub' }, c.path || ''),
				c.sha256 ? E('div', { 'class': 'fn-sha' },
					'sha256: ' + String(c.sha256).slice(0, 16) + '…') : ''
			]),
			actSlot
		]);
		c._slot = actSlot;
		this.compActions(c, actSlot);
		return row;
	},

	renderList: function(box, res) {
		var self = this;
		box.textContent = '';
		if (res === null) {
			box.appendChild(fn.unavailCard('Компоненты'));
			return;
		}
		this.comps = Array.isArray(res.components) ? res.components : [];
		if (this.comps.length === 0) {
			box.appendChild(E('div', { 'class': 'fn-card', style: 'padding:6px 0' }, [
				E('div', { 'class': 'fn-rowitem', style: 'border:none' }, [
					E('span', { 'class': 'fn-dot y' }),
					E('div', { 'class': 'fn-rowsub' },
						'Реестр компонентов пуст — backend ещё не отдал список вендорных бинарей.')
				])
			]));
			return;
		}
		var card = E('div', { 'class': 'fn-card', style: 'padding:6px 0' });
		this.comps.forEach(function(c) { card.appendChild(self.compRow(c)); });
		box.appendChild(card);
	},

	render: function() {
		fn.loadCSS();
		var self = this;

		var checkBtn = E('button', { 'class': 'fn-btn primary' }, '↻ Проверить обновления');
		checkBtn.addEventListener('click', function() {
			if (self.comps.length === 0) { fn.notify('Список компонентов ещё не загружен'); return; }
			checkBtn.disabled = true;
			checkBtn.textContent = '';
			checkBtn.appendChild(E('span', { 'class': 'fn-spin' }));
			checkBtn.appendChild(document.createTextNode(' Проверяю…'));
			var seq = Promise.resolve();
			self.comps.forEach(function(c) {
				seq = seq.then(function() { return self.checkComponent(c, false); });
			});
			seq.then(function() {
				checkBtn.disabled = false;
				checkBtn.textContent = '↻ Проверить обновления';
			});
		});

		var listBox = E('div', [ fn.skelRows(3) ]);

		var root = E('div', [
			this.renderAppCard(),
			E('div', { 'class': 'fn-card', style: 'margin-bottom:14px' }, [
				E('div', { 'class': 'fn-spread' }, [
					E('div', [
						E('div', { 'class': 'fn-card-title' }, 'Вендорные компоненты'),
						E('div', { 'class': 'fn-card-sub' },
							'Бинари, от которых зависит маршрутизация, едут внутри пакета Морока. Версии — наши, проверенные; обновляем из своего канала, когда сами решим.')
					]),
					checkBtn
				])
			]),
			listBox
		]);

		// данные подгружаем асинхронно — страница не висит пустой (скелетон выше)
		L.resolveDefault(fn.call.components(), null).then(function(res) {
			self.renderList(listBox, res);
		});

		return fn.page('components', root);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
