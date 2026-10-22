#!/bin/sh
# Morok subscribe — обновление подписок с бэкап-ссылками.
#
# list url в подписке = основная + резервные ссылки. Идём по порядку,
# первая ответившая запоминается в last_good_url. Если все ссылки лежат
# и update_via_proxy=1 — повторяем проход через локальный mixed-порт
# sing-box (127.0.0.1:7890): домен подписки может быть недоступен напрямую,
# а туннель жив.

CONF=morok
RUN_DIR=/var/etc/morok
SUB_DIR=$RUN_DIR/sub
LOG=/tmp/log/morok.log
PROXY_PORT=7890

log() { echo "$(date '+%H:%M:%S') subscribe: $*" >>$LOG; logger -t morok-subscribe "$*"; }

fetch() { # url ua [proxy]
	local hwid_opt="$4"
	if [ "$hwid_opt" = "1" ]; then
		# панели типа Happ/Remnawave отдают конфиг только с x-hwid
		# (схема та же, что у passwall2: sha256 от mac+модель)
		local model mac hash
		model=$(cat /tmp/sysinfo/model 2>/dev/null)
		mac=$(cat /sys/class/net/eth0/address 2>/dev/null)
		hash=$(printf '%s' "$mac-$model" | sha256sum 2>/dev/null | cut -d' ' -f1)
		if [ -n "$3" ]; then
			curl -sL -m 20 -x "http://127.0.0.1:$PROXY_PORT" -A "$2" \
				-H "x-device-model: $model" -H "x-hwid: $hash" "$1" 2>/dev/null
		else
			curl -sL -m 20 -A "$2" \
				-H "x-device-model: $model" -H "x-hwid: $hash" "$1" 2>/dev/null
		fi
	elif [ -n "$3" ]; then
		curl -sL -m 20 -x "http://127.0.0.1:$PROXY_PORT" -A "$2" "$1" 2>/dev/null
	else
		curl -sL -m 20 -A "$2" "$1" 2>/dev/null
	fi
}

update_one() {
	local sid=$1
	[ "$(uci -q get $CONF.$sid.enabled)" = "1" ] || return 0

	local ua; ua=$(uci -q get $CONF.$sid.user_agent); ua=${ua:-sing-box}
	local via_proxy; via_proxy=$(uci -q get $CONF.$sid.update_via_proxy)
	local hwid; hwid=$(uci -q get $CONF.$sid.hwid); hwid=${hwid:-0}

	local urls u body good=''
	# uci get на list-опции отдаёт все значения через пробел
	urls=$(uci -q get $CONF.$sid.url)

	for u in $urls; do
		body=$(fetch "$u" "$ua" "" "$hwid")
		if [ -n "$body" ] && [ ${#body} -gt 16 ]; then good=$u; break; fi
		log "$sid: $u не ответила, пробую следующую"
	done

	# второй шанс — через туннель
	if [ -z "$good" ] && [ "$via_proxy" = "1" ]; then
		log "$sid: все ссылки молчат напрямую — пробую через прокси"
		for u in $urls; do
			body=$(fetch "$u" "$ua" proxy "$hwid")
			if [ -n "$body" ] && [ ${#body} -gt 16 ]; then good=$u; break; fi
		done
	fi

	if [ -z "$good" ]; then
		log "$sid: обновление не удалось — ни одна ссылка не ответила"
		return 1
	fi

	mkdir -p $SUB_DIR
	echo "$body" >$SUB_DIR/$sid.raw
	uci set $CONF.$sid.last_good_url="$good"
	uci set $CONF.$sid.last_update="$(date +%s)"
	uci commit $CONF
	log "$sid: обновлено с $good (${#body} байт)"

	/usr/share/morok/parse_nodes.uc "$sid" "$SUB_DIR/$sid.raw" 2>>$LOG || \
		log "$sid: парсер нод вернул ошибку (см. лог)"
}

list_subs() {
	# реальные имена секций (cfgXXXX) — `uci show` на части прошивок
	# печатает анонимные секции как @type[N], что ломает origin у нод
	ucode -e "
		import { cursor } from 'uci';
		let c = cursor(); c.load('$CONF');
		c.foreach('$CONF', 'subscription', function(s) { print(s['.name'], '\n'); });
	"
}

case "$1" in
all)
	for sid in $(list_subs); do
		update_one "$sid"
	done
	;;
auto)
	# cron-режим: обновляет подписки, у которых enabled=1 и истёк
	# update_interval (сек) по last_update. Остальные не трогает.
	now=$(date +%s)
	for sid in $(list_subs); do
		[ "$(uci -q get $CONF.$sid.enabled)" = "1" ] || continue
		iv=$(uci -q get $CONF.$sid.update_interval); iv=${iv:-21600}
		[ "$iv" -gt 0 ] 2>/dev/null || continue
		lu=$(uci -q get $CONF.$sid.last_update); lu=${lu:-0}
		if [ $((now - lu)) -ge "$iv" ]; then
			log "$sid: интервал $iv с истёк — обновляю"
			update_one "$sid"
		fi
	done
	;;
'') echo "usage: $0 {all|auto|<subscription-id>}"; exit 1 ;;
*) update_one "$1" ;;
esac
