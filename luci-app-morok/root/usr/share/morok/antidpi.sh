#!/bin/sh
# antidpi.sh — управление движком оптимизации доставки nfqws2 (zapret2).
#
# Контракт: бинарь поставляет наш пакет в /usr/lib/morok/bin/nfqws2.
# Lua-движок стратегий вендорится в /usr/share/morok/lua/ (официальные
# zapret-lib.lua + zapret-antidpi.lua из bol-van/zapret2, версия бинаря
# и библиотек должна совпадать).
# Ядро: нужны kmod-nfnetlink-queue + kmod-nft-queue (в стоковой
# GL-прошивке их нет — ставятся из репо GL или приносятся пакетом).
# Пока бинаря/модулей нет — graceful degradation: warning в лог,
# трафик идёт как решил sing-box (antidpi-правила = direct), никаких
# crash-loop.
#
# Трафик в движок попадает через nft: при старте скрипт ДИНАМИЧЕСКИ
# добавляет в chain postrouting таблицы inet morok правило
# `queue num 200 bypass` (статически в morok.nft его нет: без
# kmod-nft-queue загрузка таблицы упала бы целиком). bypass: если
# движок умер — пакеты проходят напрямую, ничего не рвётся.
#
# Стратегии (antidpi.strategy) — аргументы nfqws2 (zapret2, Lua API):
#   youtube   — TCP/443 multisplit ClientHello (pos=1,midsld) по hostlist;
#               QUIC (UDP/443) к этим доменам — drop, чтобы клиент упал
#               на TCP, где работает десинх. Мягкий профиль: минимальное
#               вмешательство, без fooling.
#   universal — агрессивный набор: настоящий ClientHello клонируется
#               (tls_client_hello_clone), его копия уходит фейком с fooling
#               (ip_ttl=8 — фейк умирает до сервера, но сбивает DPI;
#               tcp_md5 — DPI отбрасывает сегмент, сервер игнорирует опцию;
#               badsum — фейк с битой TCP-контролькой), затем реальный
#               hello дробится multidisorder (pos=1,midsld). TCP/80 —
#               multisplit pos=2,host. QUIC (UDP/443) — drop. Hostlist —
#               как у youtube.
#   custom    — antidpi.strategy_custom подставляется как есть
#               (полный набор --filter/--lua-desync, можно с --new)
# Перед применением стратегии — самопроверка `nfqws2 --dry-run`
# (команда check): rpcd set_antidpi сначала гоняет её, и только при
# успехе перезапускает движок — битая строка custom не роняет работающий
# движок.

CONF=morok
RUN_DIR=/var/etc/morok
BIN=/usr/lib/morok/bin/nfqws2
LUA_DIR=/usr/share/morok/lua
PIDFILE=$RUN_DIR/nfqws2.pid
HOSTLIST=$RUN_DIR/antidpi-hostlist.txt
LOG=/tmp/log/morok.log
QNUM=200

log() { echo "$(date '+%H:%M:%S') antidpi: $*" >>$LOG; logger -t morok-antidpi "$*"; }

# есть ли вообще включённые antidpi-правила
have_antidpi_rules() {
	[ "$(ucode -e "
		import { cursor } from 'uci';
		let c = cursor(); c.load('$CONF');
		let n = 0;
		c.foreach('$CONF', 'rule', function(s) {
			if (s.enabled == '1' && s.action == 'antidpi') n++;
		});
		print(n);
	")" != "0" ]
}

# hostlist: домены из custom-правил action=antidpi + сиды профиля.
# geosite/source_list-правила развернуть в домены на лету не можем —
# для них работает сид-профиль или движок без hostlist-фильтра.
build_hostlist() {
	local strategy; strategy=$(uci -q get $CONF.antidpi.strategy); strategy=${strategy:-youtube}
	mkdir -p $RUN_DIR
	ucode -e "
		import { cursor } from 'uci';
		let c = cursor(); c.load('$CONF');
		let seen = {}; let out = [];
		function add(d) { d = lc(d); if (d != '' && !seen[d]) { seen[d] = 1; push(out, d); } }
		c.foreach('$CONF', 'rule', function(s) {
			if (s.enabled != '1' || s.action != 'antidpi') return;
			if (s.match_type != 'custom') return;
			let mm = type(s.match) == 'array' ? s.match : (s.match ? [ s.match ] : []);
			for (let m in mm) add(m);
		});
		// сиды профилей: основные домены доставки контента — geosite-правила
		// (youtube/discord/meta) в домены на лету не разворачиваются, без
		// сидов hostlist пустовал бы. custom тоже сидируем: сканер
		// (scan_apply) пишет в strategy_custom профили с --hostlist=<этот
		// файл> — без сидов файл удалялся бы как пустой и custom-профиль
		// не проходил dry-run («cannot access hostlist file»)
		if ('$strategy' == 'youtube' || '$strategy' == 'universal' || '$strategy' == 'custom') {
			add('youtube.com'); add('googlevideo.com');
			add('ytimg.com'); add('youtu.be'); add('youtube-nocookie.com');
			add('ggpht.com'); add('googleapis.com');
		}
		print(join('\n', out));
	" >$HOSTLIST 2>/dev/null
	[ -s $HOSTLIST ] || rm -f $HOSTLIST
}

# аргументы профиля стратегии. $1 = hostlist-аргумент (или пусто)
strategy_args() {
	local hl="$1"
	local strategy; strategy=$(uci -q get $CONF.antidpi.strategy); strategy=${strategy:-youtube}
	case "$strategy" in
	youtube)
		echo "--filter-tcp=443 $hl --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443 $hl --lua-desync=drop"
		;;
	universal)
		# клон настоящего ClientHello → его копия фейком с fooling
		# (ttl=8 не доходит до сервера, md5/badsum — страховка, чтобы
		# сервер фейк точно не принял) → реальный hello multidisorder'ом
		echo "--filter-tcp=443 $hl --lua-desync=tls_client_hello_clone:blob=fake_hello --lua-desync=fake:blob=fake_hello:ip_ttl=8:tcp_md5:badsum --lua-desync=multidisorder:pos=1,midsld --new --filter-tcp=80 $hl --lua-desync=multisplit:pos=2,host --new --filter-udp=443 $hl --lua-desync=drop"
		;;
	custom)
		uci -q get $CONF.antidpi.strategy_custom
		;;
	*)
		log "неизвестная стратегия '$strategy' — беру youtube"
		echo "--filter-tcp=443 $hl --lua-desync=multisplit:pos=1,midsld --new --filter-udp=443 $hl --lua-desync=drop"
		;;
	esac
}

is_running() { [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; }

# --dry-run проверяет только опции командной строки — имена lua-функций
# nfqws2 резолвит лениво, когда придёт подходящий пакет, и опечатка в
# custom прошла бы молча (десинх просто не сработает). Сверяем имена
# --lua-desync=func с определениями в lua-библиотеках сами.
check_lua_funcs() {
	local args="$1"
	local f bad=""
	for f in $(printf '%s\n' "$args" | grep -o -- '--lua-desync=[a-zA-Z_0-9]*' | sed 's/--lua-desync=//'); do
		grep -q "^function $f(" $LUA_DIR/zapret-lib.lua $LUA_DIR/zapret-antidpi.lua 2>/dev/null || bad="$bad $f"
	done
	if [ -n "$bad" ]; then
		echo "ERROR: неизвестные lua-desync функции:$bad (смотрите $LUA_DIR/zapret-antidpi.lua)" >&2
		return 1
	fi
	return 0
}

# самопроверка аргументов текущей стратегии (--dry-run + сверка
# lua-функций), без запуска движка и без заворота трафика. rc=0 —
# стратегия валидна; rc!=0 — честная ошибка в stderr для rpcd.
# rpcd set_antidpi гоняет check ДО перезапуска движка: битый custom
# не роняет работающий движок.
check() {
	local engine; engine=$(uci -q get $CONF.antidpi.engine); engine=${engine:-none}
	[ "$engine" = "zapret2" ] || { echo "engine=$engine — движку проверять нечего"; return 0; }
	if [ ! -x "$BIN" ]; then
		echo "ERROR: $BIN не найден" >&2; return 1
	fi
	if [ ! -f "$LUA_DIR/zapret-lib.lua" ] || [ ! -f "$LUA_DIR/zapret-antidpi.lua" ]; then
		echo "ERROR: нет lua-библиотек в $LUA_DIR" >&2; return 1
	fi
	build_hostlist
	local hl=""
	[ -f "$HOSTLIST" ] && hl="--hostlist=$HOSTLIST"
	local args; args=$(strategy_args "$hl")
	if [ -z "$args" ]; then
		echo "ERROR: пустая стратегия (custom без strategy_custom?)" >&2; return 1
	fi
	check_lua_funcs "$args" || return 1
	local lua_init="--lua-init=@$LUA_DIR/zapret-lib.lua --lua-init=@$LUA_DIR/zapret-antidpi.lua"
	# shellcheck disable=SC2086
	$BIN --dry-run --user=root --qnum=$QNUM $lua_init $args
}

# заворот исходящего TCP/UDP в NFQUEUE $QNUM (bypass: без слушателя
# пакеты проходят дальше, ничего не рвётся)
queue_up() {
	nft list chain inet morok postrouting >/dev/null 2>&1 || return 0
	# идемпотентно: правило уже есть — второе не добавляем
	nft list chain inet morok postrouting 2>/dev/null | grep -q "queue.*to $QNUM" && return 0
	if nft add rule inet morok postrouting meta l4proto '{ tcp, udp }' queue num $QNUM bypass 2>/dev/null; then
		return 0
	fi
	log "WARNING: ядро не приняло queue-правило (нет kmod-nft-queue?) — оптимизация невозможна на этой прошивке"
	return 1
}

queue_down() {
	local h
	for h in $(nft -a list chain inet morok postrouting 2>/dev/null | grep "queue num $QNUM" | sed 's/.*# handle //'); do
		nft delete rule inet morok postrouting handle "$h" 2>/dev/null
	done
}

start() {
	local engine; engine=$(uci -q get $CONF.antidpi.engine); engine=${engine:-none}
	[ "$engine" = "zapret2" ] || { log "engine=$engine — движок не нужен"; return 0; }
	have_antidpi_rules || { log "нет включённых antidpi-правил — движок не запускаю"; return 0; }
	is_running && return 0
	# осиротевший демон без pidfile (pidfile nfqws2 ненадёжен) —
	# усыновляем, а не плодим дубликаты на одной очереди
	local orphan; orphan=$(pidof nfqws2 2>/dev/null | cut -d' ' -f1)
	if [ -n "$orphan" ]; then
		echo "$orphan" >$PIDFILE
		log "nfqws2 уже жив (pid $orphan) — усыновляю"
		queue_up
		return 0
	fi

	if [ ! -x "$BIN" ]; then
		# бинарь ещё не принесли — НЕ падаем: antidpi-правила остаются
		# direct (или уйдут в proxy по решению guardian). Честно предупреждаем.
		log "WARNING: $BIN не найден — оптимизация недоступна, правила action=antidpi работают как direct"
		return 0
	fi
	if [ ! -f "$LUA_DIR/zapret-lib.lua" ] || [ ! -f "$LUA_DIR/zapret-antidpi.lua" ]; then
		log "WARNING: нет lua-библиотек в $LUA_DIR — оптимизация недоступна"
		return 0
	fi

	build_hostlist
	local hl=""
	[ -f "$HOSTLIST" ] && hl="--hostlist=$HOSTLIST"
	local args; args=$(strategy_args "$hl")
	[ -n "$args" ] || { log "пустая стратегия (custom?) — движок не запускаю"; return 0; }

	local lua_init="--lua-init=@$LUA_DIR/zapret-lib.lua --lua-init=@$LUA_DIR/zapret-antidpi.lua"

	# --user=root: по умолчанию nfqws2 дропает привилегии на uid-max,
	# после чего не может ни hostlist перечитать, ни rawsend —
	# на роутере работаем от root
	# самопроверка аргументов до заворота трафика
	if ! check_lua_funcs "$args" >>$LOG 2>&1; then
		log "WARNING: стратегия ссылается на неизвестные lua-функции — движок не запускаю (см. выше)"
		return 0
	fi
	# shellcheck disable=SC2086
	if ! $BIN --dry-run --user=root --qnum=$QNUM $lua_init $args >>$LOG 2>&1; then
		log "WARNING: nfqws2 отверг аргументы стратегии — движок не запускаю (см. выше)"
		return 0
	fi

	queue_up || { log "движок не запускаю: нет пути трафика в NFQUEUE"; return 0; }

	(
		# закрываем procd-lock fd и reload-lock fd, иначе init.d/morok
		# повиснет на старте/будет вечно держать lock
		exec 1000>&- 1001>&- 9>&- 2>/dev/null
		exec </dev/null >>$LOG 2>&1
		# shellcheck disable=SC2086
		$BIN --daemon --user=root --pidfile=$PIDFILE --qnum=$QNUM $lua_init $args
	)
	# --daemon пишет pidfile асинхронно — ждём до 3с
	local i=0
	while [ ! -s $PIDFILE ] && [ $i -lt 3 ]; do sleep 1; i=$((i+1)); done
	if is_running; then
		local msg="nfqws2 запущен (pid $(cat $PIDFILE), qnum=$QNUM"
		[ -n "$hl" ] && msg="$msg, hostlist=$(wc -l <$HOSTLIST | tr -d ' ') доменов"
		log "$msg)"
	else
		log "WARNING: nfqws2 стартовал и сразу умер — см. лог выше"
		queue_down
		rm -f $PIDFILE
	fi
}

stop() {
	local pids=""
	[ -s "$PIDFILE" ] && pids=$(cat $PIDFILE)
	# pidfile пуст/потерян — добиваем по имени, сирот не оставляем
	[ -z "$pids" ] && pids=$(pidof nfqws2 2>/dev/null)
	if [ -n "$pids" ]; then
		kill $pids 2>/dev/null
		# ждём реальной смерти процесса: иначе restart ловил гонку —
		# start() "усыновлял" ещё не умершего демона как сироту,
		# и через секунду движок оказывался мёртв
		local i=0 alive p
		while [ $i -lt 20 ]; do
			alive=0
			for p in $pids; do kill -0 "$p" 2>/dev/null && alive=1; done
			[ $alive -eq 0 ] && break
			sleep 0.1
			i=$((i+1))
		done
		# не умер за 2с — добиваем жёстко
		for p in $pids; do kill -9 "$p" 2>/dev/null; done
	fi
	rm -f $PIDFILE
	queue_down
}

case "$1" in
	start)   start ;;
	stop)    stop ;;
	restart) stop; start ;;
	check)   check; exit $? ;;
	status)  is_running && echo running || echo stopped ;;
	*) echo "usage: $0 {start|stop|restart|check|status}"; exit 1 ;;
esac
exit 0
