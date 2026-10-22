#!/bin/sh
# scan_antidpi.sh — сканер профилей доставки zapret2 (батарея scan_profiles.txt).
#
# Прогоняет профили по очереди: глушит nfqws2 → поднимает с аргументами
# профиля (hostlist текущий) → probe каждого домена: DoH-резолв через
# туннель (системный DNS может быть недостоверен, урок 16) + прямой
# curl --resolve с таймаутом 4с → код+время в scan_state.json. В конце
# (и по TERM/INT — trap) возвращает исходную стратегию: UCI сканер НЕ
# трогает, восстановление = antidpi.sh restart.
#
# Singleton: flock на fd 200 (+ файл-флаг .scan_lock, который видит
# guardian и пропускает тики, пока идёт сканирование).
#
# Режимы:
#   start [d1,d2,...]  — запустить прогон в фон и выйти (rc=1, если уже идёт)
#   stop               — послать TERM прогону (он сам восстановит стратегию)
#   status             — running|stopped

CONF=morok
RUN_DIR=/var/etc/morok
BIN=/usr/lib/morok/bin/nfqws2
LUA_DIR=/usr/share/morok/lua
PROFILES=/usr/share/morok/scan_profiles.txt
STATE=$RUN_DIR/scan_state.json
RESULTS=$RUN_DIR/.scan_results.jsonl
LOCK=$RUN_DIR/.scan_lock
SCAN_PIDFILE=$RUN_DIR/scan.pid
ENGINE_PIDFILE=$RUN_DIR/scan_nfqws2.pid
HOSTLIST=$RUN_DIR/antidpi-hostlist.txt
LOG=/tmp/log/morok.log
QNUM=200
PROBE_TIMEOUT=4

log() { echo "$(date '+%H:%M:%S') scan: $*" >>$LOG; logger -t morok-scan "$*"; }

# ---------- движок ----------

engine_stop() {
	local pids=""
	[ -s "$ENGINE_PIDFILE" ] && pids=$(cat $ENGINE_PIDFILE)
	[ -z "$pids" ] && pids=$(pidof nfqws2 2>/dev/null)
	if [ -n "$pids" ]; then
		kill $pids 2>/dev/null
		# ждём реальной смерти (урок 17: иначе следующий профиль
		# стартует параллельно с умирающим демоном на одной очереди)
		local i=0 alive p
		while [ $i -lt 20 ]; do
			alive=0
			for p in $pids; do kill -0 "$p" 2>/dev/null && alive=1; done
			[ $alive -eq 0 ] && break
			sleep 0.1
			i=$((i+1))
		done
		for p in $pids; do kill -9 "$p" 2>/dev/null; done
	fi
	rm -f $ENGINE_PIDFILE
}

engine_start_profile() { # $1=tcp_args $2=udp_args (%HL% уже подставлен)
	local args="$1"
	[ -n "$2" ] && args="$args --new $2"
	local lua_init="--lua-init=@$LUA_DIR/zapret-lib.lua --lua-init=@$LUA_DIR/zapret-antidpi.lua"
	(
		# закрываем procd/reload-lock fd (уроки 6/§2.6) и stdio
		exec 1000>&- 1001>&- 9>&- 2>/dev/null
		exec </dev/null >>$LOG 2>&1
		# shellcheck disable=SC2086
		$BIN --daemon --user=root --pidfile=$ENGINE_PIDFILE --qnum=$QNUM $lua_init $args
	)
	local i=0
	while [ ! -s $ENGINE_PIDFILE ] && [ $i -lt 3 ]; do sleep 1; i=$((i+1)); done
}

# заворот в NFQUEUE (bypass: без слушателя пакеты идут напрямую);
# идемпотентно, как queue_up в antidpi.sh
queue_up() {
	nft list chain inet morok postrouting >/dev/null 2>&1 || return 0
	nft list chain inet morok postrouting 2>/dev/null | grep -q "queue.*to $QNUM" && return 0
	nft add rule inet morok postrouting meta l4proto '{ tcp, udp }' queue num $QNUM bypass 2>/dev/null
}

# ---------- probe ----------

resolve_doh() { # $1=domain → ip или пусто
	curl -s -x http://127.0.0.1:7890 -m 6 \
		"https://1.1.1.1/dns-query?name=$1&type=A" \
		-H 'accept: application/dns-json' 2>/dev/null \
		| sed -n 's/.*"data":"\([0-9][0-9.]*\)".*/\1/p' | head -1
}

get_ip() { # $1=domain из кэша IPS ("d=ip" построчно)
	printf '%s\n' "$IPS" | grep -F "$1=" | head -1 | cut -d= -f2
}

probe_domain() { # $1=domain $2=ip → "code ms"
	local out code sec ms
	out=$(curl -s -o /dev/null -m $PROBE_TIMEOUT -w '%{http_code} %{time_total}' \
		--resolve "$1:443:$2" "https://$1/" 2>/dev/null)
	[ -z "$out" ] && out="000 0"
	code=${out%% *}
	sec=${out#* }
	[ "$sec" = "$out" ] && sec=0
	ms=$(awk "BEGIN{printf \"%d\", ($sec)*1000}" 2>/dev/null)
	echo "$code ${ms:-0}"
}

# ---------- состояние ----------

write_state() { # $1=running(true/false) $2=current_id $3=current_label
	{
		printf '{"running":%s,"started":%s,"stopped":%s,"done":%s,"total":%s,' \
			"$1" "${STARTED:-0}" "${STOPPED:-false}" "${DONE:-0}" "${TOTAL:-0}"
		printf '"current":"%s","current_label":"%s",' "$2" "$3"
		printf '"domains":['
		local first=1 d
		for d in $DOMAINS; do
			[ $first -eq 0 ] && printf ','
			first=0
			printf '"%s"' "$d"
		done
		printf '],"results":['
		# строки RESULTS — готовые JSON-объекты профилей
		if [ -s "$RESULTS" ]; then
			awk 'BEGIN{first=1} {if(!first)printf ","; first=0; printf "%s",$0}' $RESULTS
		fi
		printf ']}'
	} >$STATE.tmp
	mv $STATE.tmp $STATE
}

# ---------- восстановление (обязано отработать и по прерыванию) ----------

RESTORED=0
restore_original() { # $1=stopped (true/false)
	[ "$RESTORED" = "1" ] && return 0
	RESTORED=1
	STOPPED=$1
	engine_stop
	# UCI сканер не менял — restart поднимает движок с исходной стратегией
	/usr/share/morok/antidpi.sh restart >>$LOG 2>&1
	write_state false "" ""
	rm -f $LOCK $SCAN_PIDFILE $ENGINE_PIDFILE $RESULTS $STATE.tmp
	log "прогон завершён (stopped=$1, профилей $DONE/$TOTAL) — исходная стратегия восстановлена"
}

# ---------- основной прогон ----------

run_scan() { # $1 = "d1 d2" (уже расклеено)
	trap 'restore_original true; exit 0' TERM INT HUP
	trap 'restore_original false' EXIT

	DOMAINS="$1"
	STARTED=$(date +%s)
	STOPPED=false
	DONE=0
	TOTAL=$(grep '|' $PROFILES 2>/dev/null | grep -vc '^#')
	TOTAL=${TOTAL:-0}

	if [ ! -x "$BIN" ] || [ ! -f "$PROFILES" ]; then
		log "ERROR: нет $BIN или $PROFILES — сканирование невозможно"
		TOTAL=0
		restore_original false
		return 1
	fi

	# %HL% → hostlist-аргумент (или пусто)
	HL_ARG=""
	[ -f "$HOSTLIST" ] && HL_ARG="--hostlist=$HOSTLIST"

	# DoH-резолв доменов через туннель ОДИН раз на прогон
	IPS=""
	local d ip
	for d in $DOMAINS; do
		ip=$(resolve_doh "$d")
		[ -z "$ip" ] && log "WARNING: DoH-резолв $d через туннель не удался — домен будет 000"
		IPS="${IPS}${d}=${ip}
"
	done

	queue_up
	write_state true "" ""

	local id label tcp udp
	while IFS='|' read -r id label tcp udp; do
		case "$id" in ''|\#*) continue ;; esac
		# подстановка hostlist-аргумента
		tcp=$(printf '%s' "$tcp" | sed "s|%HL%|$HL_ARG|g")
		udp=$(printf '%s' "$udp" | sed "s|%HL%|$HL_ARG|g")

		write_state true "$id" "$label"
		engine_stop
		engine_start_profile "$tcp" "$udp"

		local line dr_first=1 code ms
		line="{\"id\":\"$id\",\"label\":\"$label\",\"domain_results\":{"
		for d in $DOMAINS; do
			ip=$(get_ip "$d")
			if [ -z "$ip" ]; then
				code=000; ms=0
			else
				code=$(probe_domain "$d" "$ip")
				ms=${code#* }
				code=${code%% *}
			fi
			[ $dr_first -eq 0 ] && line="$line,"
			dr_first=0
			line="$line\"$d\":{\"code\":\"$code\",\"ms\":${ms:-0}}"
		done
		line="$line}}"
		echo "$line" >>$RESULTS
		DONE=$((DONE+1))
		write_state true "$id" "$label"
		log "[$DONE/$TOTAL] $id: $(echo "$line" | sed 's/.*domain_results://')"
	done <$PROFILES

	restore_original false
}

# ---------- вход ----------

case "$1" in
start)
	# домены: аргумент через запятую; дефолт — пара владельца
	DOMS=${2:-youtube.com,googlevideo.com}
	mkdir -p $RUN_DIR /tmp/log
	# singleton: flock на fd 200 (урок 13); файл $LOCK — ещё и флаг
	# для guardian («не мешай сканеру») — снимается в restore_original
	exec 200>$LOCK
	flock -n 200 || { echo "сканирование уже идёт" >&2; exit 1; }
	: >$RESULTS
	(
		# отвязка от вызывающего (rpcd/init): lock-fd'ы и stdio;
		# fd 200 НЕ закрываем — это наш singleton-lock
		exec 1000>&- 1001>&- 9>&- 2>/dev/null
		exec </dev/null >>$LOG 2>&1
		run_scan "$(printf '%s' "$DOMS" | tr ',' ' ')"
	) &
	# $$ в подшелле = pid родителя (урок 9) — пишем $! снаружи
	echo $! >$SCAN_PIDFILE
	log "прогон запущен: домены '$DOMS'"
	# stdout НЕ должен быть пустым: ucode rindex в sh_full не находит
	# маркер в позиции 0 (возвращает -1) и rpcd посчитает запуск упавшим
	echo "started: $DOMS"
	exit 0
	;;
stop)
	if [ -s "$SCAN_PIDFILE" ] && kill -0 "$(cat $SCAN_PIDFILE)" 2>/dev/null; then
		kill "$(cat $SCAN_PIDFILE)" 2>/dev/null
		exit 0
	fi
	echo "сканирование не идёт" >&2
	exit 1
	;;
status)
	[ -s "$SCAN_PIDFILE" ] && kill -0 "$(cat $SCAN_PIDFILE)" 2>/dev/null && echo running || echo stopped
	;;
*) echo "usage: $0 {start [d1,d2]|stop|status}"; exit 1 ;;
esac
