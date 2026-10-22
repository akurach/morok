#!/bin/sh
# Morok guardian — сторож адаптивных правил оптимизации.
#
# Для каждого правила action=antidpi + adaptive=1:
#   * раз в check_interval проверяет probe_url через ПРЯМОЙ путь
#     (curl с роутера идёт через nfqueue/nfqws2, если движок жив — то есть
#     ровно тем путём, которым пойдёт трафик клиентов при действии «Оптимизация»)
#   * fail_threshold неудач подряд -> правило временно уходит в proxy
#     (пишем /var/etc/morok/adaptive_state.json и делаем reload)
#   * раз в rescan_interval пробуем вернуть правило обратно на оптимизацию
#
# Состояние: /var/etc/morok/guardian.state, строки вида
#   @rule[N]=fails:mode:since:lastprobe
# (N — порядковый индекс правила в конфиге; gen_config.uc ключует
# adaptive_state.json тем же индексом, guardian_status в ubus читает
# этот же файл). Всё в tmpfs, флеш не трогаем.

CONF=morok
RUN_DIR=/var/etc/morok
STATE_JSON=$RUN_DIR/adaptive_state.json
GUARD_STATE=$RUN_DIR/guardian.state
PIDFILE=$RUN_DIR/guardian.pid
LOG=/tmp/log/morok.log

log() { echo "$(date '+%H:%M:%S') guardian: $*" >>$LOG; logger -t morok-guardian "$*"; }

uci_get() { uci -q get $CONF.$1; }

read_config() {
	CHECK_INTERVAL=$(uci_get antidpi.check_interval);   CHECK_INTERVAL=${CHECK_INTERVAL:-300}
	FAIL_THRESHOLD=$(uci_get antidpi.fail_threshold);   FAIL_THRESHOLD=${FAIL_THRESHOLD:-3}
	RESCAN_INTERVAL=$(uci_get antidpi.rescan_interval); RESCAN_INTERVAL=${RESCAN_INTERVAL:-21600}
	PROBE_URL=$(uci_get antidpi.probe_url);             PROBE_URL=${PROBE_URL:-https://www.youtube.com/generate_204}
}

# список анонимных id правил с adaptive=1 (в порядке конфига)
adaptive_rules() {
	local i=0 sid
	while sid=$(uci -q get "$CONF.@rule[$i]"); do
		[ "$(uci_get @rule[$i].action)" = "antidpi" ] && \
		[ "$(uci_get @rule[$i].adaptive)" = "1" ] && \
		[ "$(uci_get @rule[$i].enabled)" = "1" ] && \
			echo "@rule[$i]"
		i=$((i+1))
	done
}

# читаем/пишем плоское состояние: rule_id=fails:mode:since:lastprobe
# ВАЖНО: ключ "@rule[N]" содержит скобки — обычный grep воспринимает [N]
# как символьный класс и НЕ матчит литерал (боевой баг: состояние
# дублировалось бесконечно). Только -F (фиксированная строка).
get_state() { grep -sF "$1=" $GUARD_STATE | tail -n1 | cut -d= -f2-; }
set_state() {
	grep -vF "$1=" $GUARD_STATE >$GUARD_STATE.tmp 2>/dev/null
	echo "$1=$2" >>$GUARD_STATE.tmp
	mv $GUARD_STATE.tmp $GUARD_STATE
}

rebuild_state_json() {
	: >$STATE_JSON.tmp
	echo -n "{" >>$STATE_JSON.tmp
	local first=1 rule st mode
	for rule in $(adaptive_rules); do
		st=$(get_state "$rule"); st=${st:-0:antidpi:0:0}
		mode=$(echo "$st" | cut -d: -f2)
		[ $first -eq 0 ] && echo -n "," >>$STATE_JSON.tmp
		first=0
		# ключ — числовой индекс правила; gen_config.uc читает его же
		echo -n "\"${rule#@rule[}\":\"$mode\"" | tr -d ']' >>$STATE_JSON.tmp
	done
	echo "}" >>$STATE_JSON.tmp
	mv $STATE_JSON.tmp $STATE_JSON
}

apply_reload() {
	/etc/init.d/morok reload >/dev/null 2>&1
	log "конфиг перегенерирован и применён"
}

probe() {
	# DNS роутера отравлен провайдером (NXDOMAIN на блокируемое) —
	# резолвим хост через DoH по туннелю, потом пробуем ПРЯМОЙ путь
	# по найденному IP (пакеты пройдут через nfqws2, если движок жив).
	local host ip
	host=$(printf '%s' "$PROBE_URL" | sed -e 's|^https\?://||' -e 's|[:/].*||')
	ip=$(curl -s -x http://127.0.0.1:7890 -m 8 \
		"https://1.1.1.1/dns-query?name=$host&type=A" \
		-H 'accept: application/dns-json' 2>/dev/null \
		| sed -n 's/.*"data":"\([0-9][0-9.]*\)".*/\1/p' | head -1)
	if [ -n "$ip" ]; then
		curl -s -o /dev/null -m 8 -w '%{http_code}' --resolve "$host:443:$ip" "$PROBE_URL" 2>/dev/null
	else
		log "probe: DoH-резолв $host не удался — пробую системный DNS"
		curl -s -o /dev/null -m 8 -w '%{http_code}' "$PROBE_URL" 2>/dev/null
	fi
}

tick() {
	# пока идёт сканер профилей доставки (.scan_lock держит scan_antidpi.sh),
	# движок постоянно перезапускают — probe мусорные, а reload
	# мог бы перебить прогон. Пропускаем тик молча.
	[ -f $RUN_DIR/.scan_lock ] && return 0
	read_config
	local rule st fails mode since code now
	for rule in $(adaptive_rules); do
		st=$(get_state "$rule"); st=${st:-0:antidpi:0:0}
		fails=$(echo "$st" | cut -d: -f1)
		mode=$(echo "$st" | cut -d: -f2)
		since=$(echo "$st" | cut -d: -f3); since=${since:-0}

		code=$(probe)
		now=$(date +%s)

		if [ "$mode" = "antidpi" ]; then
			if [ "$code" = "204" ] || [ "$code" = "200" ]; then
				fails=0
			else
				fails=$((fails+1))
				log "$rule: probe провален ($code), $fails/$FAIL_THRESHOLD"
				if [ "$fails" -ge "$FAIL_THRESHOLD" ]; then
					set_state "$rule" "0:proxy:$now:$now"
					rebuild_state_json
					log "$rule: доставка через движок умерла — правило уходит в proxy"
					apply_reload
					continue
				fi
			fi
		else # mode=proxy — ждём rescan и пробуем вернуться
			if [ $((now - since)) -ge "$RESCAN_INTERVAL" ]; then
				if [ "$code" = "204" ] || [ "$code" = "200" ]; then
					set_state "$rule" "0:antidpi:$now:$now"
					rebuild_state_json
					log "$rule: доставка через движок восстановлена — правило возвращено на оптимизацию"
					apply_reload
					continue
				fi
				since=$now
				log "$rule: рескан — прямой путь всё ещё мёртв ($code)"
			fi
		fi
		set_state "$rule" "$fails:$mode:$since:$now"
	done
	rebuild_state_json
}

case "$1" in
start)
	[ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null && exit 0
	mkdir -p $RUN_DIR /tmp/log
	# жёсткий singleton: flock переживает потерю pidfile и гонки
	# (два guardian = двойные probe/reload — уже вешали роутер)
	exec 200>$RUN_DIR/.guardian.lock
	flock -n 200 || exit 0
	(
		# отвязываемся от вызывающего: procd-lock fd, reload-lock fd и stdio
		# (fd 200 НЕ закрываем — это наш singleton-lock)
		exec 1000>&- 1001>&- 2>/dev/null
		exec </dev/null >>$LOG 2>&1
		while :; do
			tick
			sleep "${CHECK_INTERVAL:-300}" &
			wait $!
		done
	) &
	# $$ внутри подшелла = pid родителя, поэтому пишем $! снаружи
	echo $! >$PIDFILE
	;;
stop)
	[ -f "$PIDFILE" ] && kill "$(cat $PIDFILE)" 2>/dev/null && rm -f $PIDFILE
	;;
status)
	[ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null && echo "running" || echo "stopped"
	;;
*) echo "usage: $0 {start|stop|status}"; exit 1 ;;
esac
