'use strict';
'require baseclass';

/* Morok i18n — собственный двуязычный словарь (ru/en).
   Почему не каноничный po→lmo: наша сборка ручная (build/build.sh, без
   OpenWrt buildroot и po2lmo), а язык нужно переключать для одного
   приложения, не трогая локаль всей LuCI.

   Модель: ключ словаря = русский исходник (язык по умолчанию, нулевая
   стоимость рендера), значение = английский. В коде: fn._t('русская
   строка') — при lang=en подставляется перевод, иначе ключ как есть.
   Интерполяция: %s/%d подставляются по порядку из аргументов.
   Плюрализация: fn._p(n, [ru1, ru2, ru5], [en1, en2]).

   Выбор языка (по приоритету):
     1. ?lang= в URL (стенд скриншотов, отладка) — не сохраняется;
     2. localStorage morok_lang (переключатель в сайдбаре);
     3. локаль LuCI (<html lang="..."> / body.lang_XX);
     4. navigator.language;
     5. дефолт 'ru'.
   Переключатель дополнительно пишет option lang в UCI (set_global,
   best-effort) — как резервную копию настройки; читаем из localStorage,
   потому что язык нужен синхронно до первого async-запроса. */

var STR = {
	/* ---------- common.js: навигация ---------- */
	'Дашборд': 'Dashboard',
	'Пул нод': 'Node pool',
	'Маршрутизация': 'Routing',
	'Маркет': 'Market',
	'Устройства': 'Devices',
	'Оптимизация': 'Optimization',
	'Фоллбэк': 'Fallback',
	'Журнал': 'Log',
	'Диагностика': 'Diagnostics',
	'Компоненты': 'Components',
	'Язык интерфейса': 'Interface language',

	/* ---------- common.js: виджеты ---------- */
	'нет ответа': 'no reply',
	'никогда': 'never',
	'только что': 'just now',
	'%s мин назад': '%s min ago',
	'%s ч %s мин назад': '%s h %s min ago',
	'→ Прокси': '→ Proxy',
	'→ Напрямую': '→ Direct',
	'✕ Блок': '✕ Block',
	'⚡ Оптимизация': '⚡ Optimization',
	'⚡→Прокси (авто)': '⚡→Proxy (auto)',
	'данные накапливаются…': 'collecting data…',
	'%s: метод пока недоступен': '%s: method not available yet',
	'Бэкенд ещё не отвечает на этот ubus-вызов — появится после обновления backend-части Морока.':
		'The backend does not answer this ubus call yet — it will appear after a Morok backend update.',

	/* ---------- common.js: форматтеры ---------- */
	'Б': 'B', 'КБ': 'KB', 'МБ': 'MB', 'ГБ': 'GB', 'ТБ': 'TB',
	'/с': '/s',
	'%s д %s ч': '%s d %s h',
	'%s ч %s мин': '%s h %s min',
	'%s мин': '%s min',
	'%s с': '%s s',

	/* ---------- common.js: парсер share-ссылок ---------- */
	'vless: не хватает host/port/uuid': 'vless: missing host/port/uuid',
	'trojan: не хватает host/port': 'trojan: missing host/port',
	'hysteria2: не хватает host/port': 'hysteria2: missing host/port',
	'tuic: нужен uuid:password@host:port': 'tuic: uuid:password@host:port required',
	'ss: не смог разобрать ссылку': 'ss: could not parse the link',
	'vmess: не хватает add/port/id': 'vmess: missing add/port/id',
	'неизвестный протокол: %s': 'unknown protocol: %s',

	/* ---------- общее ---------- */
	'вкл': 'on',
	'выкл': 'off',
	'Отмена': 'Cancel',
	'Сохранить': 'Save',
	'Сохраняю…': 'Saving…',
	'Добавить': 'Add',
	'Проверяю…': 'Checking…',
	'проверяю…': 'checking…',
	'Ошибка: %s': 'Error: %s',
	'Не удалось удалить': 'Failed to delete',
	'работает': 'running',
	'остановлен': 'stopped',
	'sing-box не запущен — проверка невозможна': 'sing-box is not running — check impossible',

	/* ---------- dashboard.js ---------- */
	'Работает': 'Running',
	'Все ноды упали': 'All nodes are down',
	'Стоп': 'Stopped',
	'режим: %s': 'mode: %s',
	'умный': 'smart',
	'глобальный': 'global',
	'выключен': 'off',
	' · ядро: %s': ' · engine: %s',
	'пинг недоступен под xray': 'ping unavailable under xray',
	'не измерено': 'not measured',
	'не проверялись': 'not checked yet',
	'Ещё не измерялось — нажми «Проверить все» на странице нод': 'Not measured yet — press "Check all" on the nodes page',
	'%s мс': '%s ms',
	' · в цепочке %s/%s': ' · in chain %s/%s',
	' · вне цепочки': ' · not in chain',
	'%s из %s': '%s of %s',
	'нет подписок': 'no subscriptions',
	'нода недоступна — выбери другую': 'node unreachable — pick another one',
	'Все ноды недоступны': 'All nodes unreachable',
	'Сервис остановлен': 'Service stopped',
	'Подключено · режим %s': 'Connected · %s mode',
	'Умный': 'Smart',
	'Глобальный': 'Global',
	'Выключен': 'Off',
	'У xray нет Clash API — задержки нод не измеряются': 'xray has no Clash API — node latency is not measured',
	'цепочка: %s ноды': 'chain: %s nodes',
	'Kill Switch активен': 'Kill Switch active',
	'Сменить ноду': 'Change node',
	'Настроить фоллбэк': 'Configure fallback',
	'🪄 Мастер': '🪄 Wizard',
	'Мастер первого запуска': 'First-run wizard',
	'Интернет отключён Kill Switch\'ом': 'Internet is cut off by Kill Switch',
	'Все ноды недоступны — трафик перекрыт, чтобы ничего не утекло мимо туннеля.':
		'All nodes are unreachable — traffic is blocked so nothing leaks past the tunnel.',
	'основная': 'primary',
	'резерв %s': 'backup %s',
	'Быстрые переключатели': 'Quick toggles',
	'Прокси': 'Proxy',
	'весь сервис целиком': 'the entire service',
	'%s: %s': '%s: %s',
	'перекрыть интернет при падении всех нод': 'cut off the internet if all nodes go down',
	'Kill Switch: при обрыве интернет будет перекрыт': 'Kill Switch: on failure the internet will be cut off',
	'Внимание: при обрыве трафик пойдёт через провайдера': 'Warning: on failure traffic will go through the ISP',
	'Прозрачный прокси': 'Transparent proxy',
	'туннель для всех устройств LAN': 'tunnel for all LAN devices',
	'обработка пакетов для правил с действием «Оптимизация»': 'packet processing for rules with the “Optimization” action',
	'Ядро туннеля': 'Tunnel engine',
	'sing-box — стандарт; xray — для нод с транспортом xhttp (без пингов нод)':
		'sing-box — standard; xray — for nodes with xhttp transport (no node pings)',
	'Смена ядра на «%s» перезапустит туннель — интернет пропадёт примерно на 7 секунд.\n\n%sПродолжить?':
		'Switching the engine to “%s” will restart the tunnel — the internet will drop for about 7 seconds.\n\n%sContinue?',
	'Под xray нужны ноды с поддержкой xhttp; пинги нод и «Проверить все» работать не будут.\n\n':
		'xray requires nodes with xhttp support; node pings and “Test all” will not work.\n\n',
	'Ядро не переключено': 'Engine not switched',
	'Ядро: %s — применяю и перезапускаю…': 'Engine: %s — applying and restarting…',
	'Метод set_global(engine) недоступен — обнови backend': 'set_global(engine) method unavailable — update the backend',
	'⟲ Сбросить': '⟲ Reset',
	'Обнулить накопленную историю метрик': 'Reset accumulated metrics history',
	'Сбросить накопленные метрики (история графика, топ правил и нод)?':
		'Reset accumulated metrics (chart history, top rules and nodes)?',
	'Метрики сброшены — сбор начался заново': 'Metrics reset — collection restarted',
	'Сброс не удался': 'Reset failed',
	'Метод morok_metrics.reset недоступен': 'morok_metrics.reset method unavailable',
	'📊 Метрики': '📊 Metrics',
	'трафик через туннель · сбор раз в минуту, храним сутки': 'tunnel traffic · sampled every minute, kept for 24 hours',
	'Скачано через туннель': 'Downloaded via tunnel',
	'Отправлено': 'Uploaded',
	'DNS-хиджак': 'DNS hijack',
	'Аптайм sing-box': 'sing-box uptime',
	'Топ правил по трафику': 'Top rules by traffic',
	'Топ нод по трафику': 'Top nodes by traffic',
	'пока нет данных': 'no data yet',
	'Всё остальное (final)': 'Everything else (final)',
	'метрики недоступны — обнови backend (rpcd-плагин morok_metrics)':
		'metrics unavailable — update the backend (morok_metrics rpcd plugin)',
	'сборщик запущен, данные появятся через минуту': 'collector is running, data will appear within a minute',
	'трафик через туннель · семплов: %s · %s · с %s': 'tunnel traffic · samples: %s · %s · since %s',
	'per-node из Clash API': 'per-node from Clash API',
	'Clash API недоступен — только nft-счётчики': 'Clash API unavailable — nft counters only',
	'доступность: %s%% (%s/%s проверок)': 'availability: %s%% (%s/%s checks)',
	'Мастер завершён — применяю конфигурацию…': 'Wizard finished — applying configuration…',
	'Метод set_global недоступен — мастер просто закрыт': 'set_global method unavailable — wizard simply closed',
	'Пропустить': 'Skip',
	'Начать →': 'Start →',
	'← Назад': '← Back',
	'Далее →': 'Next →',
	'Завершить и применить': 'Finish and apply',
	'Наведём порядок в трафике 🌫': 'Let’s sort out your traffic 🌫',
	'Пара шагов — и роутер сам разрулит, что пустить через туннель, что напрямую, а что — на оптимизацию доставки. Займёт минуту.':
		'A few steps and the router will decide what goes through the tunnel, what goes direct, and what gets delivery optimization. Takes a minute.',
	'Название подписки — например: HLVPN': 'Subscription name — e.g. HLVPN',
	'Основная ссылка на подписку': 'Primary subscription URL',
	'Резервная ссылка (необязательно)': 'Backup URL (optional)',
	'User-Agent: sing-box (стандарт)': 'User-Agent: sing-box (default)',
	'User-Agent: v2rayN/9.99 (панели типа Happ)': 'User-Agent: v2rayN/9.99 (Happ-like panels)',
	'Нужны название и хотя бы одна ссылка': 'Name and at least one URL are required',
	'Скачиваю…': 'Downloading…',
	'＋ Добавить подписку': '＋ Add subscription',
	'Подписка «%s» добавлена — ноды скачиваются в фоне': 'Subscription “%s” added — nodes are downloading in the background',
	'Ошибка добавления подписки': 'Failed to add subscription',
	'Метод add_subscription недоступен': 'add_subscription method unavailable',
	'…или ссылка на одну ноду: vless:// trojan:// hy2:// …': '…or a single node link: vless:// trojan:// hy2:// …',
	'＋ Добавить ноду': '＋ Add node',
	'Не похоже на ссылку ноды': 'Doesn’t look like a node link',
	'Нода «%s» добавлена': 'Node “%s” added',
	'Ошибка добавления ноды': 'Failed to add node',
	'Метод add_node недоступен': 'add_node method unavailable',
	'Источник нод': 'Node source',
	'Подписка удобнее: ноды обновляются сами, а если ссылку забанят — уйдёт на резервную. Можно пропустить и добавить позже на странице «Пул нод».':
		'A subscription is more convenient: nodes update themselves, and if the URL gets blocked it falls back to the backup one. You can skip this and add it later on the “Node pool” page.',
	'HWID-заголовки — включи, если панель отдаёт заглушку «приложение не поддерживается»':
		'HWID headers — enable if the panel returns an “app not supported” stub',
	'Режим работы': 'Operating mode',
	'Как решать, что пускать через туннель.': 'How to decide what goes through the tunnel.',
	'По правилам: выбранные списки — через туннель или оптимизацию доставки, остальное — напрямую. Рекомендуется.':
		'Rule-based: selected lists go through the tunnel or delivery optimization, everything else goes direct. Recommended.',
	'Весь трафик всех устройств — через активную ноду. Для параноиков и тестов.':
		'All traffic from all devices goes through the active node. For the paranoid and for testing.',
	'Что делать, если все ноды упали.': 'What to do if all nodes go down.',
	'Перекрыть интернет': 'Cut off the internet',
	'Ни один байт не уйдёт мимо туннеля. Максимум приватности, но при обрыве интернет «ляжет».':
		'Not a single byte will leak past the tunnel. Maximum privacy, but on failure the internet goes down.',
	'Прямой выход': 'Direct egress',
	'При обрыве трафик пойдёт через провайдера — интернет останется, но без туннеля. Рекомендуется для дома.':
		'On failure traffic goes through the ISP — the internet stays up, but without the tunnel. Recommended for home.',
	'Ничего не делать': 'Do nothing',
	'Трафик просто остановится до восстановления нод.': 'Traffic simply stops until the nodes recover.',
	'Всё готово ✨': 'All set ✨',
	'Морок настроен. Сейчас конфигурация применится и сервис перезапустится — это займёт несколько секунд.':
		'Morok is configured. The configuration will now be applied and the service restarted — this takes a few seconds.',
	'Режим: %s': 'Mode: %s',
	'Kill Switch: %s': 'Kill Switch: %s',
	'перекрыть интернет': 'cut off internet',
	'прямой выход': 'direct egress',
	'⬇ Скачать бэкап': '⬇ Download backup',
	'Бэкенд не вернул бэкап': 'The backend did not return a backup',
	'Бэкап сохранён': 'Backup saved',
	'Метод backup пока недоступен': 'backup method unavailable yet',
	'Восстановить конфигурацию из файла «%s»?\nТекущие настройки Морока будут перезаписаны.':
		'Restore configuration from “%s”?\nCurrent Morok settings will be overwritten.',
	'Восстановление не удалось': 'Restore failed',
	'Конфигурация восстановлена — перезагружаю страницу…': 'Configuration restored — reloading the page…',
	'Метод restore пока недоступен': 'restore method unavailable yet',
	'⬆ Восстановить': '⬆ Restore',
	'Конфигурация': 'Configuration',
	'бэкап всех настроек Морока одним JSON-файлом — перед экспериментами или переездом на другой роутер':
		'back up all Morok settings as a single JSON file — before experiments or moving to another router',
	'🪄 Похоже, Морок ещё не настраивался': '🪄 Looks like Morok is not configured yet',
	'мастер первого запуска проведёт за минуту: подписка → режим → kill switch':
		'the first-run wizard will walk you through in a minute: subscription → mode → kill switch',
	'Позже': 'Later',
	'Пройти мастер': 'Run the wizard',
	'Туннель': 'Tunnel',
	'Активная нода': 'Active node',
	'Ноды': 'Nodes',
	'Правила': 'Rules',
	'Подписки': 'Subscriptions',
	'sing-box · конфиг из UCI': 'sing-box · config from UCI',
	'включённые и отвечающие': 'enabled and responding',
	'VPN / оптимизация / напрямую': 'VPN / optimization / direct',
	'последнее обновление': 'last update',
	'Фоллбэк-цепочка': 'Fallback chain',
	'порядок автовыбора при отказе': 'failover order on failure',
	'Применение изменений': 'Applying changes',
	'настройки пишутся в UCI сразу; перегенерация конфига — по кнопке':
		'settings are written to UCI immediately; config regeneration — via the button',
	'Применить и перезапустить': 'Apply & restart',
	'Перезапуск запущен — конфиг перегенерируется': 'Restart initiated — config will be regenerated',

	/* ---------- nodes.js ---------- */
	'Вставь одну или несколько ссылок — по одной на строку:\nvless://...\nvmess://...\ntrojan://...\nss://...\nhy2://...\ntuic://...':
		'Paste one or more links — one per line:\nvless://...\nvmess://...\ntrojan://...\nss://...\nhy2://...\ntuic://...',
	'Нет ни одной валидной ссылки': 'No valid links',
	'Добавлено: %s': 'Added: %s',
	', ошибок: %s': ', failed: %s',
	'Добавить ноду из ссылки': 'Add node from link',
	'Ссылки вида vless:// vmess:// trojan:// ss:// hy2:// tuic:// — разберутся автоматически, можно пачкой.':
		'Links like vless:// vmess:// trojan:// ss:// hy2:// tuic:// are parsed automatically, batch supported.',
	'Название — например: AWG дом': 'Name — e.g. AWG home',
	'Endpoint — host:port, например 203.0.113.10:51820': 'Endpoint — host:port, e.g. 203.0.113.10:51820',
	'Private key (обязательно)': 'Private key (required)',
	'Адреса интерфейса, CIDR через запятую: 10.8.0.2/32': 'Interface addresses, comma-separated CIDR: 10.8.0.2/32',
	'Public key пира (обязательно)': 'Peer public key (required)',
	'Preshared key (необязательно)': 'Preshared key (optional)',
	'MTU (необязательно, например 1420)': 'MTU (optional, e.g. 1420)',
	'Keepalive, сек (необязательно, например 25)': 'Keepalive, sec (optional, e.g. 25)',
	'kmod-amneziawg не установлен': 'kmod-amneziawg is not installed',
	'На роутере нет пакетов kmod-amneziawg и amneziawg-tools — AmneziaWG-нода сейчас не заведётся: backend откажет при сохранении. Установи: opkg install kmod-amneziawg amneziawg-tools':
		'The router lacks the kmod-amneziawg and amneziawg-tools packages — an AmneziaWG node will not work now: the backend will refuse to save. Install: opkg install kmod-amneziawg amneziawg-tools',
	'AmneziaWG = WireGuard с обфускацией заголовков (junk-параметры). Возьми значения из конфига Amnezia — jc/jmin/jmax/s1–s4/h1–h4 должны совпадать с сервером.':
		'AmneziaWG = WireGuard with header obfuscation (junk parameters). Take the values from the Amnezia config — jc/jmin/jmax/s1–s4/h1–h4 must match the server.',
	'Обязательные: название, endpoint (host:port), private key, адреса (CIDR), public key пира':
		'Required: name, endpoint (host:port), private key, addresses (CIDR), peer public key',
	'Endpoint должен быть вида host:port': 'Endpoint must look like host:port',
	'Поле %s: нужно неотрицательное число': 'Field %s: a non-negative number is required',
	'Нода не добавлена': 'Node was not added',
	'AmneziaWG-нода «%s» добавлена': 'AmneziaWG node “%s” added',
	'Название': 'Name',
	'Адреса интерфейса (CIDR, через запятую)': 'Interface addresses (CIDR, comma-separated)',
	'Public key пира': 'Peer public key',
	'Junk-параметры AmneziaWG (необязательно, но должны совпадать с сервером):':
		'AmneziaWG junk parameters (optional, but must match the server):',
	'Добавить AmneziaWG-ноду': 'Add AmneziaWG node',
	'Добавить и скачать': 'Add and download',
	'Подписка добавлена — ноды скачиваются…': 'Subscription added — nodes are downloading…',
	'Ошибка добавления': 'Failed to add',
	'Новая подписка': 'New subscription',
	'Если основную ссылку забанят — обновление само уйдёт на резервную. Если лягут обе — скачает через работающий туннель.':
		'If the primary URL gets blocked, updates will switch to the backup one. If both go down, it will download through the working tunnel.',
	'HWID-заголовки': 'HWID headers',
	'включи, если панель отдаёт заглушку «приложение не поддерживается» (Happ-панели)':
		'enable if the panel returns an “app not supported” stub (Happ-like panels)',
	'Название непустое, интервал — от 1 до 720 часов': 'Name must be non-empty, interval — 1 to 720 hours',
	'Не удалось сохранить подписку': 'Failed to save subscription',
	'Подписка «%s» сохранена': 'Subscription “%s” saved',
	'Метод set_subscription пока недоступен': 'set_subscription method unavailable yet',
	'Подписка: %s': 'Subscription: %s',
	'Расписание автообновления, заголовки для панели и выключение без удаления.':
		'Auto-update schedule, panel headers, and disabling without deletion.',
	'Интервал обновления, часов': 'Update interval, hours',
	'User-Agent для панели': 'User-Agent for the panel',
	'Подписка включена': 'Subscription enabled',
	'выключенная подписка не обновляется по расписанию': 'a disabled subscription is not updated on schedule',
	'нужны Happ-подобным панелям, иначе отдают заглушку': 'needed by Happ-like panels, otherwise they return a stub',
	'Заполни название, сервер и порт (1–65535)': 'Fill in name, server and port (1–65535)',
	'Не удалось сохранить ноду': 'Failed to save node',
	'Нода обновлена': 'Node updated',
	'Метод update_node пока недоступен': 'update_node method unavailable yet',
	'Редактировать ноду': 'Edit node',
	'Меняются только название и адрес — протокол и ключи остаются как в исходной ссылке. Править можно только ручные ноды.':
		'Only name and address change — protocol and keys stay as in the original link. Only manual nodes can be edited.',
	'Сервер (host)': 'Server (host)',
	'Порт': 'Port',
	'проверяется…': 'checking…',
	'Проверка нод недоступна под ядром xray — у него нет Clash API':
		'Node checking is unavailable under the xray engine — it has no Clash API',
	' Проверяем…': ' Checking…',
	'Проверить все': 'Test all',
	'Метод test_nodes недоступен': 'test_nodes method unavailable',
	'Проверка завершена': 'Check complete',
	'Транспорт xhttp: нода работает только при ядре xray (Дашборд → Ядро туннеля)':
		'xhttp transport: the node works only with the xray engine (Dashboard → Tunnel engine)',
	'пинг н/д': 'ping n/a',
	'Выключенные ноды не попадают в цепочку фоллбэка и не проксируют трафик':
		'Disabled nodes do not enter the fallback chain and do not proxy traffic',
	'включена': 'enabled',
	'выключена — в цепочку не попадёт': 'disabled — will not enter the chain',
	'Удалить ноду': 'Delete node',
	'Удалить ноду «%s»?': 'Delete node “%s”?',
	'Нода удалена': 'Node deleted',
	'Сделать активной': 'Make active',
	'Не удалось выбрать ноду': 'Failed to select node',
	'Активная нода: %s (применяется…)': 'Active node: %s (applying…)',
	'Поиск по имени, протоколу, серверу…': 'Search by name, protocol, server…',
	'+ Подписка': '+ Subscription',
	'+ Нода': '+ Node',
	'Добавить AmneziaWG-ноду (WireGuard с обфускацией)': 'Add an AmneziaWG node (WireGuard with obfuscation)',
	'На роутере нет kmod-amneziawg/amneziawg-tools — форма откроется, но сохранить не получится':
		'The router lacks kmod-amneziawg/amneziawg-tools — the form will open but saving will fail',
	'Тумблер справа включает/выключает ноду: выключенные ноды не попадают в цепочку фоллбэка и не проксируют трафик. ':
		'The toggle on the right enables/disables a node: disabled nodes do not enter the fallback chain and do not proxy traffic. ',
	'Ядро xray: пинги нод и «Проверить все» недоступны (у xray нет Clash API). Ноды с пометкой xhttp работают только под этим ядром.':
		'xray engine: node pings and “Test all” are unavailable (xray has no Clash API). Nodes marked xhttp work only under this engine.',
	'Метрики: TCP — рукопожатие с сервером, URL — реальный запрос через ноду (главная), DNS — пока не поддерживается движком (всегда «—»).':
		'Metrics: TCP — handshake with the server, URL — a real request through the node (primary), DNS — not supported by the engine yet (always “—”).',
	'Нод не получено — либо ссылка мёртвая, либо панель отдаёт заглушку (проверь, что подписка открывается в браузере). Обновлено: %s':
		'No nodes received — either the link is dead or the panel returns a stub (check that the subscription opens in a browser). Updated: %s',
	'подписка · ссылок: %s · обновлено %s': 'subscription · URLs: %s · updated %s',
	'ручные ноды': 'manual nodes',
	'↻ Обновить': '↻ Update',
	'Обновляю…': 'Updating…',
	'Подписка обновляется…': 'Subscription is updating…',
	'Настройки подписки: расписание, UA, HWID': 'Subscription settings: schedule, UA, HWID',
	'Удалить подписку и её ноды': 'Delete the subscription and its nodes',
	'Удалить подписку «%s» вместе со всеми её нодами?': 'Delete subscription “%s” together with all its nodes?',
	'Подписка удалена': 'Subscription deleted',
	' (%s нод)': ' (%s nodes)',
	'Нод пока нет': 'No nodes yet',
	'Добавь подписку или ноду по ссылке — кнопки выше.': 'Add a subscription or a node by link — buttons above.',

	/* ---------- routing.js ---------- */
	'Название не может быть пустым': 'Name cannot be empty',
	'Не удалось переименовать': 'Failed to rename',
	'Правило переименовано': 'Rule renamed',
	'Метод rename_rule пока недоступен': 'rename_rule method unavailable yet',
	'Переименовать правило': 'Rename rule',
	'Меняется только название — условия и действие остаются.': 'Only the name changes — conditions and action stay.',
	'Не удалось изменить порядок': 'Failed to change order',
	'Порядок сохранён — первое совпавшее правило побеждает': 'Order saved — first matching rule wins',
	'Метод reorder_rules пока недоступен': 'reorder_rules method unavailable yet',
	' (%s дом.)': ' (%s dom.)',
	'список: %s': 'list: %s',
	'конечное правило · применяется последним': 'final rule · applies last',
	'Выше — сработает раньше': 'Higher — matches earlier',
	'Ниже — сработает позже': 'Lower — matches later',
	'Правило «%s»: %s': 'Rule “%s”: %s',
	'адаптивное': 'adaptive',
	'Переименовать': 'Rename',
	'Удалить правило': 'Delete rule',
	'Удалить правило «%s»?': 'Delete rule “%s”?',
	'Правило удалено': 'Rule deleted',
	'Метод del_rule недоступен': 'del_rule method unavailable',
	'Домен — например: youtube.com': 'Domain — e.g. youtube.com',
	'Проверить': 'Check',
	'метод check_domain пока недоступен': 'check_domain method unavailable yet',
	'ни одно правило не совпало': 'no rule matched',
	'ИТОГ: ': 'RESULT: ',
	'матчатся, но НЕ сработают — перекрыты первым правилом:': 'matching but NOT applied — shadowed by the first rule:',
	'Введи домен': 'Enter a domain',
	'Проверить домен': 'Check a domain',
	'какое правило сработает и куда пойдёт трафик': 'which rule will match and where the traffic will go',
	'✓ %s добавлено': '✓ %s added',
	'источник: %s': 'source: %s',
	'Не удалось добавить правило': 'Failed to add rule',
	'Правило «%s» добавлено — не забудь «Применить» на дашборде': 'Rule “%s” added — don’t forget “Apply” on the dashboard',
	'Метод add_rule недоступен': 'add_rule method unavailable',
	'Быстрые пресеты': 'Quick presets',
	'один клик — готовое правило по подключённому списку': 'one click — a ready rule based on a connected list',
	'Активные правила': 'Active rules',
	'Порядок сверху вниз: первое совпавшее правило побеждает. Стрелки ↑↓ меняют порядок и сохраняют сразу.':
		'Order is top-down: first matching rule wins. The ↑↓ arrows reorder and save immediately.',
	'Отключённые': 'Disabled',
	'Добавить своё правило': 'Add a custom rule',
	'Домен или IP — например: example.com, 203.0.113.0/24': 'Domain or IP — e.g. example.com, 203.0.113.0/24',
	'Сначала введи домен или IP': 'Enter a domain or IP first',
	'Правило добавлено — не забудь «Применить» на дашборде': 'Rule added — don’t forget “Apply” on the dashboard',
	'Правила применяются сверху вниз — первое совпавшее побеждает. Сложные условия (несколько доменов, regex) — в следующих версиях.':
		'Rules apply top-down — first match wins. Complex conditions (multiple domains, regex) — in future versions.',
	'Источники списков': 'List sources',
	'↻ Обновить сейчас': '↻ Update now',
	' Обновляю…': ' Updating…',
	'«%s»: %s': '“%s”: %s',
	'ошибка обновления': 'update error',
	'обновлено': 'updated',
	' (%s записей)': ' (%s entries)',
	'Метод update_source пока недоступен': 'update_source method unavailable yet',
	'%s ч': '%s h',
	'Не удалось переключить источник': 'Failed to toggle the source',
	'Источник «%s»: %s': 'Source “%s”: %s',
	'Метод set_source пока недоступен': 'set_source method unavailable yet',

	/* ---------- market.js ---------- */
	'📺 Видео и стриминг': '📺 Video & streaming',
	'YouTube, TikTok и другие видеосервисы': 'YouTube, TikTok and other video services',
	'💬 Мессенджеры и соцсети': '💬 Messengers & social networks',
	'Discord, Meta и другие': 'Discord, Meta and others',
	'🤖 AI-сервисы': '🤖 AI services',
	'ChatGPT, Copilot и другие': 'ChatGPT, Copilot and others',
	'📋 Списки сообщества': '📋 Community lists',
	'большие готовые подборки доменов — скачиваются и обновляются автоматически':
		'large curated domain collections — downloaded and updated automatically',
	'📦 Другое': '📦 Other',
	'встроенный список доменов сервиса': 'the service’s built-in domain list',
	'встроенный список (домены + IP-диапазоны)': 'built-in list (domains + IP ranges)',
	'набор доменов из пресета': 'a set of domains from the preset',
	'внешний список сообщества (скачается и будет обновляться)': 'external community list (will be downloaded and kept updated)',
	'всё остальное': 'everything else',
	'трафик пойдёт через VPN': 'traffic goes via VPN',
	'оптимизация доставки — напрямую, без VPN': 'delivery optimization — direct, without VPN',
	'трафик пойдёт напрямую': 'traffic goes direct',
	'трафик будет заблокирован': 'traffic will be blocked',
	'Список «%s»': 'List “%s”',
	'уже подключён': 'already connected',
	'не включился': 'failed to enable',
	'был выключен — включили': 'was disabled — enabled',
	'Список «%s» — добавление': 'List “%s” — adding',
	'uci.add не удался': 'uci.add failed',
	'скачается после применения': 'will download after apply',
	'Правило «%s»': 'Rule “%s”',
	'уже есть — не дублируем': 'already exists — not duplicating',
	'источник «%s» не найден': 'source “%s” not found',
	'не добавилось': 'failed to add',
	'пустой match — нечего добавлять': 'empty match — nothing to add',
	' · ⚡ оптимизация': ' · ⚡ optimization',
	' · адаптивное': ' · adaptive',
	'Сохраняю конфиг': 'Saving config',
	'нечего коммитить': 'nothing to commit',
	'ubus uci commit недоступен': 'ubus uci commit unavailable',
	'Запускаю скачивание новых списков': 'Starting download of new lists',
	'новых списков нет': 'no new lists',
	'в фоне': 'in the background',
	'Профиль оптимизации: %s': 'Optimization profile: %s',
	'set_antidpi недоступен — пропускаем': 'set_antidpi unavailable — skipping',
	'не применилась': 'not applied',
	'Применяю конфиг (apply)': 'Applying config (apply)',
	'apply не удался': 'apply failed',
	'правил: %s': 'rules: %s',
	'списков: %s': 'lists: %s',
	'пропущено как уже имеющиеся: %s': 'skipped as already present: %s',
	'«%s»: установлено частично%s. Не встало: %s': '“%s”: partially installed%s. Failed: %s',
	'Пресет «%s» установлен%s': 'Preset “%s” installed%s',
	'со сторожем': 'watched',
	'; если оптимизация деградирует — правило временно уйдёт в VPN и вернётся само':
		'; if optimization degrades, the rule temporarily moves to VPN and returns by itself',
	' и ещё %s': ' and %s more',
	'версия %s': 'version %s',
	'✓ установлен': '✓ installed',
	'Что внутри — правила (%s)': 'What’s inside — rules (%s)',
	'Источники списков (%s)': 'List sources (%s)',
	'Профиль оптимизации': 'Optimization profile',
	'Пресет переключит профиль оптимизации на «%s». Тонкая настройка — на странице ':
		'The preset will switch the optimization profile to “%s”. Fine-tuning is on the ',
	'Список: %s': 'List: %s',
	'новый': 'new',
	'уже есть': 'already present',
	'новое': 'new',
	'Что будет при повторной установке': 'What reinstalling will do',
	'Что будет установлено': 'What will be installed',
	'Что уже есть в конфиге — пропустим, дублей не будет. После добавления конфиг применится автоматически (apply).':
		'Whatever is already in the config will be skipped — no duplicates. After adding, the config is applied automatically (apply).',
	'🔄 Обновить': '🔄 Update',
	'🔄 Установить заново': '🔄 Reinstall',
	'🛒 Установить': '🛒 Install',
	'Закрыть': 'Close',
	'Пресет': 'Preset',
	'обновился: v%s → v%s': 'updated: v%s → v%s',
	'частично': 'partial',
	'Подробнее': 'Details',
	'✓ Установлен': '✓ Installed',
	'Доустановить': 'Finish installing',
	'Каталог пуст': 'Catalog is empty',
	'Backend ответил, но пресетов не прислал — попробуйте обновить позже.':
		'The backend responded but sent no presets — try again later.',
	'Маркет пресетов': 'Preset market',
	'🛒 Маркет пресетов': '🛒 Preset market',
	' из пресета': ' from the preset',
	'Готовые наборы правил по категориям: выберите сервис → «Подробнее» покажет, что именно добавится и куда пойдёт трафик → «Установить» сделает всё за один клик. Уже имеющиеся правила не дублируются.':
		'Ready-made rule sets by category: pick a service → “Details” shows what exactly gets added and where the traffic goes → “Install” does it all in one click. Existing rules are not duplicated.',
	'обновление каждые %s ч': 'updates every %s h',

	/* ---------- antidpi.js ---------- */
	'Мягкая обработка пакетов для видеохостингов: почти не вмешивается в трафик, задержки не добавляет.':
		'Gentle packet processing for video hosting: barely touches the traffic, adds no latency.',
	'Начните с него — в большинстве сетей этого достаточно.': 'Start with it — in most networks this is enough.',
	'Более настойчивый профиль: использует несколько приёмов сразу, чтобы доставка работала даже в «сложных» сетях.':
		'A more persistent profile: uses several techniques at once so delivery works even in “difficult” networks.',
	'Выбирайте, если мягкий профиль не помог — или если диагностика его рекомендовала.':
		'Choose it if the gentle profile did not help — or if diagnostics recommended it.',
	'Своя строка параметров движка: полный контроль для тех, кто подбирает настройки под своего провайдера вручную.':
		'Your own engine parameter string: full control for those who tune settings for their ISP by hand.',
	'Сюда же попадает профиль, который подобрала диагностика из расширенной батареи.':
		'A profile picked by diagnostics from the extended set also lands here.',
	'✓ работает': '✓ works',
	'~ работает не для всех проверок': '~ works for some checks',
	'✗ не подходит': '✗ not suitable',
	'🔍 Запустить диагностику': '🔍 Run diagnostics',
	'Запускаю…': 'Starting…',
	'scan_start недоступен': 'scan_start unavailable',
	'метод scan_start недоступен': 'scan_start method unavailable',
	'⏹ Остановить': '⏹ Stop',
	'Останавливаю…': 'Stopping…',
	'не остановлено': 'not stopped',
	'Диагностика остановлена, прежний профиль восстановлен': 'Diagnostics stopped, previous profile restored',
	'метод scan_stop недоступен': 'scan_stop method unavailable',
	'⏳ профиль %s/%s%s': '⏳ profile %s/%s%s',
	'⏹ остановлено: %s': '⏹ stopped: %s',
	'✓ готово: %s': '✓ done: %s',
	'%s/%s профилей проверено': '%s/%s profiles tested',
	'Рекомендуем: %s': 'Recommended: %s',
	'Это тот же профиль, что в карточке выше — просто выберите её и нажмите «Применить».':
		'This is the same profile as in the card above — just select it and click “Apply”.',
	'Профиль из расширенной батареи — применится как «Своя стратегия».':
		'A profile from the extended set — will be applied as “Custom strategy”.',
	'Применить': 'Apply',
	'Применяю…': 'Applying…',
	'scan_apply недоступен': 'scan_apply unavailable',
	'метод scan_apply недоступен': 'scan_apply method unavailable',
	'✓ Профиль «%s» применён%s': '✓ Profile “%s” applied%s',
	' — но движок не поднялся, см. журнал': ' — but the engine did not start, see the log',
	'Ни один профиль не доставил все проверки': 'No profile delivered all checks',
	'Оптимизация в этой сети может не помочь — надёжнее перевести правила в режим «через VPN» на странице «Маршрутизация».':
		'Optimization may not help on this network — it is safer to switch the rules to “via VPN” mode on the “Routing” page.',
	'Профиль': 'Profile',
	'★ лучший': '★ best',
	'Все результаты (%s профилей)': 'All results (%s profiles)',
	'Диагностика доставки': 'Delivery diagnostics',
	'Не знаете, какой профиль выбрать? Роутер сам проверит всю батарею (%s профилей) на ваших сервисах и подскажет лучший. По окончании вернётся прежний профиль.':
		'Not sure which profile to choose? The router will test the whole battery (%s profiles) against your services and suggest the best one. The previous profile is restored afterwards.',
	'Что проверяем:': 'What to test:',
	'первые результаты появятся через несколько секунд…': 'first results will appear in a few seconds…',
	'⚠ во время проверки движок оптимизации кратковременно перезапускается; трафик правил в режиме «через VPN» не затрагивается.':
		'⚠ during the test the optimization engine restarts briefly; traffic of rules in “via VPN” mode is not affected.',
	'Статус движка': 'Engine status',
	'оптимизация доставки пакетов на лету, без VPN': 'on-the-fly packet delivery optimization, without VPN',
	'Движок': 'Engine',
	'Активный профиль': 'Active profile',
	'как сейчас обрабатываются пакеты': 'how packets are processed right now',
	'Адаптивный сторож': 'Adaptive guardian',
	'Доменов в хостлисте': 'Domains in hostlist',
	'%s вкл. правил «Оптимизация» + сиды профиля': '%s enabled “Optimization” rules + profile seeds',
	'сторож: правил нет': 'guardian: no rules',
	'сторож: увёл в VPN': 'guardian: moved to VPN',
	'сторож: часть правил в VPN': 'guardian: some rules in VPN',
	'сторож: оптимизация активна': 'guardian: optimization active',
	'строка пустая — вставьте аргументы nfqws2': 'the line is empty — paste nfqws2 arguments',
	'стратегия должна быть одной строкой': 'the strategy must be a single line',
	'слишком длинно: максимум 2000 символов': 'too long: 2000 characters max',
	'нет ни одного фильтра — нужен хотя бы один --filter-tcp= или --filter-udp=':
		'no filters — at least one --filter-tcp= or --filter-udp= is required',
	'нет приёмов обработки (--lua-desync=…) — пакеты пойдут без изменений':
		'no processing techniques (--lua-desync=…) — packets will pass unchanged',
	'Пример: --filter-tcp=443 --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443 --lua-desync=drop':
		'Example: --filter-tcp=443 --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443 --lua-desync=drop',
	'✓ выглядит корректно — перед применением движок ещё прогонит самопроверку (dry-run)':
		'✓ looks valid — the engine will also run a self-check (dry-run) before applying',
	'активна': 'active',
	'★ рекомендовано': '★ recommended',
	'По итогам последней диагностики': 'Based on the latest diagnostics',
	'Применить профиль': 'Apply profile',
	'Проверяю и применяю…': 'Checking and applying…',
	'не удалось применить': 'failed to apply',
	'применено': 'applied',
	'✗ метод set_antidpi недоступен': '✗ set_antidpi method unavailable',
	'Профиль — это способ обработки пакетов. Выберите готовый или запустите диагностику ниже — она сама подскажет, что работает в вашей сети. Перед применением движок прогоняет самопроверку: битый профиль не роняет работающий — останется прежний.':
		'A profile is a packet processing method. Pick a ready one or run the diagnostics below — it will tell you what works on your network. Before applying, the engine runs a self-check: a broken profile does not kill the working one — the previous one stays.',
	'не удалось записать настройку': 'failed to write the setting',
	'настройка сохранена локально, но commit недоступен': 'setting saved locally, but commit is unavailable',
	'Сторож: настройка сохранена — вступит в силу на следующей проверке':
		'Guardian: setting saved — takes effect on the next check',
	'Сейчас сторожу нечего охранять: нет включённых правил с действием «Оптимизация» и флажком «адаптивное». Включите такое правило на странице «Маршрутизация» — и сторож начнёт следить.':
		'Right now the guardian has nothing to watch: there are no enabled rules with the “Optimization” action and the “adaptive” flag. Enable such a rule on the “Routing” page — and the guardian will start watching.',
	'Прямой путь сейчас не отвечает, поэтому сторож ВРЕМЕННО пустил трафик через VPN — всё продолжает работать. Он периодически проверяет прямой путь и сам вернёт правило на оптимизацию, когда доставка восстановится.':
		'The direct path is not responding right now, so the guardian has TEMPORARILY routed traffic via VPN — everything keeps working. It periodically checks the direct path and returns the rule to optimization by itself once delivery recovers.',
	'Если профиль перестанет работать, сторож это заметит и ВРЕМЕННО переведёт трафик правила через VPN — сервисы продолжат открываться. Когда прямой путь оживёт, сторож сам вернёт правило на оптимизацию.':
		'If the profile stops working, the guardian will notice and TEMPORARILY move the rule’s traffic via VPN — services will keep opening. When the direct path recovers, the guardian returns the rule to optimization by itself.',
	'Адаптивный сторож ': 'Adaptive guardian ',
	'Считать профиль сломанным после': 'Consider the profile broken after',
	'подряд неудачных проверок — потом правило уйдёт в VPN': 'consecutive failed checks — then the rule moves to VPN',
	'Проверять прямой путь каждые': 'Check the direct path every',
	'как часто сторож делает контрольный запрос': 'how often the guardian makes a probe request',
	'Пытаться вернуть на оптимизацию каждые': 'Try to return to optimization every',
	'пока правило в VPN, сторож изредка пробует прямой путь': 'while the rule is in VPN, the guardian occasionally probes the direct path',
	'1 мин': '1 min',
	'5 мин': '5 min',
	'10 мин': '10 min',
	'1 ч': '1 h',
	'6 ч': '6 h',
	'сутки': '24 h',
	'Флажок «адаптивное» включается у каждого правила на странице «Маршрутизация». Настройки сторож подхватывает сам, перезапуск не нужен.':
		'The “adaptive” checkbox is enabled per rule on the “Routing” page. The guardian picks up settings by itself, no restart needed.',
	'Пока ни одно правило не использует оптимизацию — движок простаивает. Добавьте правило с действием «Оптимизация» в Маршрутизации или установите пресет из Маркета.':
		'No rule uses optimization yet — the engine is idle. Add a rule with the “Optimization” action in Routing or install a preset from the Market.',
	'Какие правила используют оптимизацию': 'Which rules use optimization',
	'Оптимизация применяется только к трафику этих правил — остальное идёт как настроено в маршрутизации.':
		'Optimization applies only to the traffic of these rules — the rest goes as configured in routing.',
	'🧭 Открыть Маршрутизацию': '🧭 Open Routing',
	'🔬 Проверить': '🔬 Test',
	'Введите домен': 'Enter a domain',
	'метод test_antidpi недоступен': 'test_antidpi method unavailable',
	'✓ Доставка есть! Оптимизация работает': '✓ Delivery works! Optimization is working',
	'✗ Доставки нет — попробуйте другой профиль': '✗ No delivery — try another profile',
	'✗ Проверка не удалась': '✗ Check failed',
	'Проверка доставки': 'Delivery check',
	'Быстрая проверка одного домена: резолв через туннель (системный DNS может быть недостоверен), затем запрос НАПРЯМУЮ — через движок, если он жив.':
		'Quick check of a single domain: resolve via the tunnel (system DNS may be unreliable), then a DIRECT request — through the engine if it is alive.',
	'пусто — движок работает без hostlist-фильтра или не запущен':
		'empty — the engine works without a hostlist filter or is not running',
	'Домены в хостлисте (%s)': 'Domains in hostlist (%s)',
	'Хостлист оптимизации': 'Optimization hostlist',
	'Собирается автоматически из включённых правил с действием «Оптимизация» плюс сиды профиля. Только чтение — меняется через правила, а не руками.':
		'Collected automatically from enabled rules with the “Optimization” action plus profile seeds. Read-only — changed via rules, not by hand.',
	'Оптимизация (get_antidpi)': 'Optimization (get_antidpi)',
	' мс': ' ms',
	'выключено': 'disabled',

	/* ---------- fallback.js ---------- */
	'Основная': 'Primary',
	'Резерв %s': 'Backup %s',
	'Раньше в цепочке': 'Earlier in the chain',
	'Позже в цепочке': 'Later in the chain',
	'Убрать из цепочки': 'Remove from chain',
	' · выключена — urltest её пропустит': ' · disabled — urltest will skip it',
	'нода не найдена — убери её из цепочки': 'node not found — remove it from the chain',
	'Цепочка пуста — добавь ноды из пула ниже. Первая в цепочке становится основной.':
		'The chain is empty — add nodes from the pool below. The first in the chain becomes primary.',
	'Сохранить цепочку': 'Save chain',
	'Не удалось сохранить цепочку': 'Failed to save the chain',
	'Цепочка сохранена — применяется…': 'Chain saved — applying…',
	'Метод set_chain пока недоступен': 'set_chain method unavailable yet',
	'⚡ Подобрать 3 быстрейшие': '⚡ Pick 3 fastest',
	'Проверяем ноды…': 'Testing nodes…',
	'Ни одна включённая нода не ответила — цепочка не изменена': 'No enabled node responded — chain unchanged',
	'Подобрано %s — нажми «Сохранить цепочку»': 'Picked %s — click “Save chain”',
	'Проверка нод недоступна': 'Node check unavailable',
	'Пул нод — добавить в цепочку': 'Node pool — add to chain',
	'+ в цепочку': '+ to chain',
	'Выключенные ноды здесь не показываются и в цепочку не попадают — включить можно на странице «Пул нод».':
		'Disabled nodes are not shown here and do not enter the chain — they can be enabled on the “Node pool” page.',
	'Цепочка фоллбэка': 'Fallback chain',
	'если основная нода умирает — трафик уходит на следующую живую (urltest)':
		'if the primary node dies, traffic moves to the next alive one (urltest)',
	'URL проверки сохранён': 'Check URL saved',
	'Порог переключения: %s': 'Failover threshold: %s',
	'Метод проверки живости': 'Liveness check method',
	'URL-test: реальный запрос через ноду, а не просто ping': 'URL test: a real request through the node, not just ping',
	'Переключаться после': 'Switch after',
	'подряд неудачных проверок': 'consecutive failed checks',
	'Возвращаться к основной автоматически': 'Return to primary automatically',
	'с задержкой %s с против флаппинга': 'with a %s s delay against flapping',
	'Автовозврат: %s': 'Auto-return: %s',
	'🔒 Перекрыть интернет': '🔒 Cut off internet',
	'⚠️ Пустить напрямую': '⚠️ Allow direct',
	'🤷 Ничего': '🤷 Nothing',
	'При обрыве ничего не произойдёт': 'Nothing will happen on failure',
	'Что делать, если умерли все ноды в цепочке:': 'What to do if all nodes in the chain die:',
	'⚠ Kill Switch': '⚠ Kill Switch',
	'«Перекрыть интернет» — ни один пакет не уйдёт мимо туннеля: провайдер не увидит, куда ты ходишь, даже пока VPN лежит.':
		'“Cut off internet” — not a single packet will leak past the tunnel: the ISP will not see where you go, even while the VPN is down.',
	'Адаптивные правила оптимизации ': 'Adaptive optimization rules ',
	'Сторож проверяет правила «Оптимизация»: если доставка через движок деградирует — правило временно уходит в прокси, после rescan пытается вернуться. Живой статус — на вкладке «Журнал».':
		'The guardian watches “Optimization” rules: if delivery through the engine degrades, the rule temporarily moves to proxy and tries to return after a rescan. Live status is on the “Log” tab.',

	/* ---------- devices.js ---------- */
	'Следовать правилам': 'Follow rules',
	'Напрямую': 'Direct',
	'Всегда VPN': 'Always VPN',
	' (недоступна)': ' (unavailable)',
	'Не удалось сохранить маршрут': 'Failed to save route',
	'%s: маршрут сохранён': '%s: route saved',
	'Метод set_device пока недоступен': 'set_device method unavailable yet',
	'онлайн': 'online',
	'офлайн': 'offline',
	'Не удалось переключить': 'Failed to toggle',
	'правило вкл': 'rule on',
	'правило выкл': 'rule off',
	'Убрать устройство из списка': 'Remove device from the list',
	'Убрать устройство «%s» и его маршрут?': 'Remove device “%s” and its route?',
	'Устройство удалено': 'Device removed',
	'Метод del_device пока недоступен': 'del_device method unavailable yet',
	'Устройства в сети': 'Devices on the network',
	'Нет устройств': 'No devices',
	'Появятся после подключения к роутеру — Морок подхватит их из DHCP-аренд автоматически.':
		'They will appear after connecting to the router — Morok picks them up from DHCP leases automatically.',
	'Маршрут устройства важнее общих правил: «Всегда VPN» гонит весь трафик устройства через туннель, «Напрямую» — мимо него, конкретная нода — закрепляет устройство за ней.':
		'A device route overrides general rules: “Always VPN” sends all the device traffic through the tunnel, “Direct” — around it, a specific node — pins the device to it.',
	'Офлайн': 'Offline',

	/* ---------- components.js ---------- */
	'канал обновлений недоступен — проверьте соединение': 'update channel unavailable — check your connection',
	'ошибка': 'error',
	'метод check_update пока недоступен': 'check_update method unavailable yet',
	'проверка не удалась': 'check failed',
	'Доступно обновление «%s»: %s → %s': 'Update available for “%s”: %s → %s',
	'«%s»: версия %s актуальна': '“%s”: version %s is up to date',
	'⬆ Обновить до %s': '⬆ Update to %s',
	' Обновляю…': ' Updating…',
	'«%s» обновлён%s': '“%s” updated%s',
	' до %s': ' to %s',
	'Метод update_component пока недоступен': 'update_component method unavailable yet',
	'✓ актуально': '✓ up to date',
	'Вернуть версию %s': 'Restore version %s',
	'↩ Откатить': '↩ Roll back',
	'Откатить «%s» к версии %s?': 'Roll back “%s” to version %s?',
	'Откатываю…': 'Rolling back…',
	'откат не удался': 'rollback failed',
	'«%s» откачен к %s': '“%s” rolled back to %s',
	'Метод rollback пока недоступен': 'rollback method unavailable yet',
	'Спросить канал обновлений про этот компонент': 'Ask the update channel about this component',
	'Спросить канал обновлений приложения': 'Ask the app update channel',
	'⟳ Проверить': '⟳ Check',
	'обновляю…': 'updating…',
	'backend без поддержки обновлений': 'backend without update support',
	'✓ обновлено%s': '✓ updated%s',
	'статус неизвестен — проверь после перезагрузки': 'status unknown — check after reload',
	'⟳ Обновить страницу': '⟳ Reload page',
	'Обновить приложение Морок до версии %s?\n\nВо время обновления сервис перезапустится — туннель на минуту прервётся. После обновления страницу нужно будет перезагрузить (Ctrl+Shift+R).':
		'Update the Morok app to version %s?\n\nThe service restarts during the update — the tunnel will drop for about a minute. After the update the page must be reloaded (Ctrl+Shift+R).',
	'обновление не удалось': 'update failed',
	'Морок обновлён%s — обнови страницу': 'Morok updated%s — reload the page',
	'Ответ от app_update не дождались (таймаут запроса) — обновление, скорее всего, ещё идёт на роутере. Вернись сюда через минуту и обнови страницу.':
		'No answer from app_update (request timeout) — the update is most likely still running on the router. Come back in a minute and reload the page.',
	'Приложение Морок': 'Morok app',
	'LuCI-интерфейс + rpcd-backend одним пакетом. Обновление ставит новый ipk/apk из нашего канала.':
		'LuCI frontend + rpcd backend in one package. Updating installs a new ipk/apk from our channel.',
	'Метод app_check пока недоступен — backend без поддержки обновлений':
		'app_check method unavailable yet — backend without update support',
	'Приложение Морок: %s': 'Morok app: %s',
	'Доступно обновление приложения: %s → %s': 'App update available: %s → %s',
	'Приложение актуально (%s)': 'App is up to date (%s)',
	'Реестр компонентов пуст — backend ещё не отдал список вендорных бинарей.':
		'Component registry is empty — the backend has not provided the list of vendor binaries yet.',
	'↻ Проверить обновления': '↻ Check for updates',
	' Проверяю…': ' Checking…',
	'Список компонентов ещё не загружен': 'Component list is not loaded yet',
	'Вендорные компоненты': 'Vendor components',
	'Бинари, от которых зависит маршрутизация, едут внутри пакета Морока. Версии — наши, проверенные; обновляем из своего канала, когда сами решим.':
		'The binaries routing depends on ship inside the Morok package. Versions are ours, tested; we update from our own channel when we decide to.',

	/* ---------- diag.js ---------- */
	'Сервис sing-box': 'sing-box service',
	'Конфигурация (UCI → sing-box.json)': 'Configuration (UCI → sing-box.json)',
	'Туннель: трафик идёт через ноду': 'Tunnel: traffic goes through the node',
	'DNS: резолв и подмена': 'DNS: resolution and hijack',
	'Доставка пакетов (правила оптимизации)': 'Packet delivery (optimization rules)',
	'ожидает запуска': 'waiting to run',
	'🔧 Исправить': '🔧 Fix',
	'Чиню…': 'Fixing…',
	'Исправление не удалось': 'Fix failed',
	'Исправление выполнено — перепроверяю шаг…': 'Fix applied — rechecking the step…',
	'Метод run_fix пока недоступен': 'run_fix method unavailable yet',
	'проверено %s из %s': 'checked %s of %s',
	'проблем: %s': 'problems: %s',
	'замечаний: %s': 'warnings: %s',
	'всё в порядке': 'all good',
	'▶ Запустить проверку': '▶ Run check',
	'↻ Проверить ещё раз': '↻ Check again',
	'поэтапная проверка: сервис → конфиг → туннель → DNS → доставка пакетов':
		'step-by-step check: service → config → tunnel → DNS → packet delivery',
	'Шаги проверки': 'Check steps',

	/* ---------- log.js ---------- */
	'следим': 'watching',
	'оптимизация': 'optimization',
	'через VPN': 'via VPN',
	'Сторож (guardian) ': 'Guardian ',
	'статус неизвестен': 'status unknown',
	'движок: %s': 'engine: %s',
	'оптимизация: %s': 'optimization: %s',
	'активна': 'active',
	'не запущена': 'not running',
	'режим: %s': 'mode: %s',
	'проверка: %s': 'probe: %s',
	'последняя проверка: %s': 'last probe: %s',
	'Ничего не совпало с фильтром': 'Nothing matches the filter',
	'Лог пуст': 'Log is empty',
	'Фильтр по тексту…': 'Filter by text…',
	'⏸ Пауза': '⏸ Pause',
	'▶ Продолжить': '▶ Resume',
	'обновление каждые 5 с': 'refresh every 5 s',
	'метод read_log недоступен': 'read_log method unavailable'
};

var lang = null;

function detect() {
	if (lang) return lang;
	/* 1. ?lang= в URL (стенд, отладка) */
	try {
		var q = new URLSearchParams(window.location.search).get('lang');
		if (q === 'ru' || q === 'en') { lang = q; return lang; }
	} catch (e) {}
	/* 2. сохранённый выбор пользователя */
	try {
		var v = window.localStorage && localStorage.getItem('morok_lang');
		if (v === 'ru' || v === 'en') { lang = v; return lang; }
	} catch (e) {}
	/* 3. локаль LuCI: <html lang> или body.lang_XX */
	var cand = '';
	try {
		cand = (document.documentElement.getAttribute('lang') || '').toLowerCase();
		if (!cand && document.body) {
			var m = (document.body.className || '').match(/\blang_([a-z]{2})\b/);
			if (m) cand = m[1];
		}
	} catch (e) {}
	/* 4. браузер */
	if (!cand)
		try { cand = String(navigator.language || '').toLowerCase(); } catch (e) {}
	lang = cand.indexOf('ru') === 0 ? 'ru' : cand.indexOf('en') === 0 ? 'en' : 'ru';
	return lang;
}

function interp(s, args) {
	var i = 0;
	return String(s).replace(/%[sd%]/g, function(tok) {
		if (tok === '%%') return '%';
		return i < args.length ? String(args[i++]) : tok;
	});
}

return baseclass.extend({
	/* текущий язык: 'ru' | 'en' */
	getLang: function() { return detect(); },

	/* выставить язык и запомнить в localStorage (UCI пишет вызывающий) */
	setLang: function(l) {
		if (l !== 'ru' && l !== 'en') return;
		lang = l;
		try { localStorage.setItem('morok_lang', l); } catch (e) {}
	},

	/* перевод строки: _t('русский текст' [, подстановки %s/%d…]) */
	t: function(s) {
		var out = String(s);
		if (detect() === 'en' && Object.prototype.hasOwnProperty.call(STR, out))
			out = STR[out];
		if (arguments.length > 1)
			out = interp(out, Array.prototype.slice.call(arguments, 1));
		return out;
	},

	/* плюрализация: _p(n, ['%s домен','%s домена','%s доменов'],
	   ['%s domain','%s domains']) — ru 3 формы, en 2 */
	p: function(n, ruForms, enForms) {
		n = Math.abs(Number(n) || 0);
		var form;
		if (detect() === 'en') {
			form = enForms[n === 1 ? 0 : 1];
		} else {
			var m10 = n % 10, m100 = n % 100;
			form = (m10 === 1 && m100 !== 11) ? ruForms[0]
				: (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? ruForms[1]
				: ruForms[2];
		}
		return interp(form, [ n ]);
	},

	/* есть ли перевод (для отладки/стенда) */
	has: function(s) { return Object.prototype.hasOwnProperty.call(STR, String(s)); },

	/* словарь (для стенда/проверок покрытия) */
	dict: STR
});
