#!/bin/sh
# test_nodes.sh — параллельная проверка всех ВКЛЮЧЁННЫХ нод (passwall-стиль).
#
# Для каждой ноды фоновый джоб пишет $TEST_D/<id>.res одной строкой:
#   <tcp_ms> <url_ms>
# где '-' = нет данных.
#   tcp_ms — время TCP-connect к server:port (curl time_connect; TLS не
#            нужен, важен сам факт коннекта — отказ/таймаут дают 0).
#   url_ms — реальная прокси-проба через Clash API
#            /proxies/<id>/delay?url=<fallback.test_url>.
#   dns_ok — здесь не измеряется: Clash API не умеет DNS-пробу через
#            конкретный outbound; rpcd честно отдаёт null.
#
# Вызывается из rpcd-метода test_nodes СИНХРОННО: внутри всё параллельно,
# суммарное время ~ худший из таймаутов (tcp 4с / url 7с), а не сумма по 33 нодам.

TEST_D=/var/etc/morok/test.d
CLASH=http://127.0.0.1:9090

TEST_URL=$(uci -q get morok.fallback.test_url)
TEST_URL=${TEST_URL:-https://www.gstatic.com/generate_204}

mkdir -p $TEST_D
rm -f $TEST_D/*.res 2>/dev/null

SB_UP=0
pidof sing-box >/dev/null 2>&1 && SB_UP=1

check_one() { # id server port
	local id=$1 server=$2 port=$3 tcp url delay
	if [ -z "$server" ] || [ -z "$port" ]; then
		echo "- -" >"$TEST_D/$id.res"
		return
	fi
	# TCP-connect: на отказе time_connect=0.000000, на таймауте >= -m.
	# rc не проверяем: TLS-рукопожатие обломится (rc=35/56), это норма.
	tcp=$(curl -s -o /dev/null -m 4 -k -w '%{time_connect}' "https://$server:$port/" 2>/dev/null)
	tcp=$(awk -v t="$tcp" 'BEGIN{ if (t+0 > 0.0005 && t+0 < 3.9) printf "%d", t*1000; else printf "-" }')
	url=-
	if [ "$SB_UP" = "1" ]; then
		delay=$(curl -s -m 7 "$CLASH/proxies/$id/delay?timeout=6000&url=$TEST_URL" 2>/dev/null | \
			grep -o '"delay":[0-9]*' | cut -d: -f2)
		[ -n "$delay" ] && url=$delay
	fi
	echo "$tcp $url" >"$TEST_D/$id.res"
}

# список включённых нод: id<TAB>server<TAB>port (ucode, .name — cfgXXXX;
# `uci show` на GL для анонимных секций не парсим — боевой урок TZ §2.1)
nodes=$(ucode -e '
import { cursor } from "uci";
let c = cursor(); c.load("morok");
c.foreach("morok", "node", function(s) {
	if (s.enabled != "1") return;
	printf("%s\t%s\t%s\n", s[".name"], s.server || "", s.port || "");
});' 2>/dev/null)

# цикл с перенаправлением (не конвейер!) — выполняется в текущем шелле,
# поэтому wait ниже ждёт всех фоновых джобов
while IFS="$(printf '\t')" read -r id server port; do
	[ -n "$id" ] || continue
	check_one "$id" "$server" "$port" &
done <<EOF
$nodes
EOF
wait
exit 0
