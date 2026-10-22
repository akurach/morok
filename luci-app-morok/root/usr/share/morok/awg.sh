#!/bin/sh
# awg.sh start|stop|status — системные интерфейсы AmneziaWG для нод type=awg.
#
# Модель: amnezia-жunk-параметры (Jc/Jmin/Jmax/S1..S4/H1..H4) — фича
# AmneziaWG, её не выразить ни в sing-box wireguard-outbound, ни в xray.
# Поэтому нода awg = системный интерфейс awg-<id секции>, а движок прокси
# заворачивает в него трафик через direct/freedom outbound с
# bind_interface + fwmark (gen_config.uc / xray_gen.uc).
#
# Два бэкенда подъёма интерфейса, поведение снаружи идентично:
#   kernel     — kmod-amneziawg: ip link add type amneziawg
#   userspace  — amneziawg-go (вендорный /usr/lib/morok/bin/amneziawg-go):
#                демон создаёт TUN-интерфейс сам; для прошивок, где kmod
#                не собрать/не загрузить (кастомное ядро, чужой vermagic).
# В обоих случаях конфигурация — через awg setconf (amneziawg-tools;
# userspace-утилита, говорит с kernel-модулем через netlink или с
# amneziawg-go через UAPI-сокет /var/run/wireguard/<iface>.sock).
#
# Маршрутизация: mark = 29000 + <порядковый номер awg-ноды в UCI> (тот же
# порядок foreach используют генераторы — формула общая, см. W3_NOTES_C.md);
# ip rule fwmark → отдельная table с default dev <if>. Основная таблица
# не трогается, kill switch и tproxy работают как раньше.
#
# Без kmod/amneziawg-go/amneziawg-tools — понятная ошибка в лог, rc=1;
# сервис morok из-за этого не падает (init вызывает нас с || true).

CONF=morok
RUN_DIR=/var/etc/morok
LOG_TAG=morok-awg
GO_BIN=/usr/lib/morok/bin/amneziawg-go
MOROK_LOG=/tmp/log/morok.log

say() { logger -t $LOG_TAG "$*"; echo "$*"; }

have_kmod() {
	lsmod 2>/dev/null | awk '$1=="amneziawg"{f=1} END{exit !f}' && return 0
	ls /lib/modules/*/amneziawg.ko >/dev/null 2>&1
}

have_tools() { command -v awg >/dev/null 2>&1; }

have_go() { [ -x $GO_BIN ]; }

# kernel|userspace|none — каким бэкендом будем поднимать интерфейсы.
# kernel предпочтителен (быстрее, меньше процессов); userspace — фоллбэк.
awg_backend() {
	if have_kmod; then echo kernel; return; fi
	if have_go; then echo userspace; return; fi
	echo none
}

# дамп awg-нод из UCI в плоский список с разделителем '|' (не whitespace:
# пустые поля не схлопываются при read; base64-ключи '|' не содержат).
# ucode: `uci show` на GL печатает анонимные секции как @node[N] —
# не парсим его никогда (TZ §2.1).
# Формат строки:
# idx|id|server|port|private_key|address(через запятую)|peer_public_key|
# preshared_key|jc|jmin|jmax|s1|s2|s3|s4|h1|h2|h3|h4|mtu|keepalive
dump_nodes() {
	ucode -e '
import { cursor } from "uci";
let c = cursor(); c.load("morok");
let idx = 0;
c.foreach("morok", "node", function(s) {
	if (s.enabled != "1" || s.type != "awg") return;
	idx++;
	let addr = type(s.address) == "array" ? join(",", s.address) : (s.address || "");
	let f = [ idx, s[".name"], s.server || "", s.port || "",
		s.private_key || "", addr, s.peer_public_key || "",
		s.preshared_key || "", s.jc || "", s.jmin || "", s.jmax || "",
		s.s1 || "", s.s2 || "", s.s3 || "", s.s4 || "",
		s.h1 || "", s.h2 || "", s.h3 || "", s.h4 || "",
		s.mtu || "", s.keepalive || "" ];
	print(join("|", f) + "\n");
});
'
}

write_conf() {
	# $1=conf $2=priv $3=ppk $4=psk $5=server $6=port
	# $7=jc $8=jmin $9=jmax $10=s1 $11=s2 $12=s3 $13=s4
	# $14=h1 $15=h2 $16=h3 $17=h4 $18=keepalive
	local conf=$1 priv=$2 ppk=$3 psk=$4 server=$5 port=$6
	local jc=$7 jmin=$8 jmax=$9 s1=${10} s2=${11} s3=${12} s4=${13}
	local h1=${14} h2=${15} h3=${16} h4=${17} keepalive=${18}
	{
		echo "[Interface]"
		echo "PrivateKey = $priv"
		[ -n "$jc" ] && echo "Jc = $jc"
		[ -n "$jmin" ] && echo "Jmin = $jmin"
		[ -n "$jmax" ] && echo "Jmax = $jmax"
		[ -n "$s1" ] && echo "S1 = $s1"
		[ -n "$s2" ] && echo "S2 = $s2"
		[ -n "$s3" ] && echo "S3 = $s3"
		[ -n "$s4" ] && echo "S4 = $s4"
		[ -n "$h1" ] && echo "H1 = $h1"
		[ -n "$h2" ] && echo "H2 = $h2"
		[ -n "$h3" ] && echo "H3 = $h3"
		[ -n "$h4" ] && echo "H4 = $h4"
		echo "[Peer]"
		echo "PublicKey = $ppk"
		[ -n "$psk" ] && echo "PresharedKey = $psk"
		echo "Endpoint = $server:$port"
		echo "AllowedIPs = 0.0.0.0/0"
		[ -n "$keepalive" ] && echo "PersistentKeepalive = $keepalive"
	} > $conf
	chmod 600 $conf
}

go_pidfile() { echo "$RUN_DIR/$1.go.pid"; }

# короткая пауза: busybox sleep на GL-прошивке не понимает дробные
# секунды ('invalid number'), usleep — есть
nap() { usleep 200000 2>/dev/null || sleep 1; }

go_find_pid() {
	# pid демона amneziawg-go, обслуживающего $1, — по /proc/*/cmdline.
	# Страховка к pidfile: amneziawg-go без -f сам уходит в фон, и $!
	# указывает на недолгоживущего родителя, а не на демона
	local ifname=$1 d pid args
	for d in /proc/[0-9]*; do
		pid=${d#/proc/}
		args=$(tr '\0' ' ' < $d/cmdline 2>/dev/null)
		case "$args" in
			"$GO_BIN $ifname "*|"$GO_BIN -f $ifname "*|"$GO_BIN --foreground $ifname "*)
				echo $pid
				return 0
				;;
		esac
	done
	return 1
}

go_daemon_running() {
	# $1=ifname; жив ли наш amneziawg-go (pidfile + kill -0, фоллбэк cmdline)
	local pf pid
	pf=$(go_pidfile "$1")
	pid=$(cat "$pf" 2>/dev/null)
	case "$pid" in ''|*[!0-9]*) ;; *)
		kill -0 "$pid" 2>/dev/null && return 0 ;;
	esac
	go_find_pid "$1" >/dev/null 2>&1
}

stop_go_daemon() {
	# $1=ifname; гасим демона amneziawg-go: и по pidfile, и по cmdline
	# (pidfile мог протухнуть/не соответствовать демону)
	local ifname=$1 pf pid i
	pf=$(go_pidfile "$ifname")
	for pid in $(cat "$pf" 2>/dev/null) $(go_find_pid "$ifname"); do
		case "$pid" in ''|*[!0-9]*) continue ;; esac
		kill -0 "$pid" 2>/dev/null || continue
		kill "$pid" 2>/dev/null
		# tun-интерфейс умирает вместе с демоном; ждём недолго (до ~2 с)
		i=0
		while [ $i -lt 10 ] && kill -0 "$pid" 2>/dev/null; do
			nap; i=$((i + 1))
		done
		kill -9 "$pid" 2>/dev/null
	done
	rm -f "$pf"
}

# userspace-подъём: демон amneziawg-go создаёт TUN-интерфейс $ifname.
# -f = foreground: демонизацию делаем мы сами (& + pidfile), иначе
# бинарь форкается и pidfile показывает на мёртвого родителя.
# Отвязка fd по уроку 13 (guardian.sh): закрываем procd-lock (1000/1001),
# reload-lock (9) и наш flock (200) — демон не должен их наследовать,
# иначе /etc/init.d/morok stop|restart и повторный awg.sh start повиснут.
start_go_daemon() {
	local id=$1 ifname=$2 pf tries=0
	pf=$(go_pidfile "$ifname")
	stop_go_daemon "$ifname"
	ip link del dev $ifname 2>/dev/null
	mkdir -p /tmp/log
	(
		exec 200>&- 1000>&- 1001>&- 9>&- 2>/dev/null
		exec </dev/null >>$MOROK_LOG 2>&1
		exec $GO_BIN -f $ifname
	) &
	echo $! > "$pf"
	# демон создаёт интерфейс не мгновенно — ждём до ~5 с
	while [ $tries -lt 25 ]; do
		ip link show dev $ifname >/dev/null 2>&1 && return 0
		# демон умер на старте (занято, нет /dev/net/tun) — ждать бессмысленно
		go_daemon_running "$ifname" || break
		nap; tries=$((tries + 1))
	done
	say "нода $id: amneziawg-go не создал интерфейс $ifname (лог: $MOROK_LOG)"
	stop_go_daemon "$ifname"
	return 1
}

start() {
	mkdir -p $RUN_DIR
	# singleton на время подъёма: init и reload могут дёрнуть нас параллельно
	# (урок 13: flock на fd 200; демоны-потомки fd 200 закрывают — см. выше)
	exec 200>$RUN_DIR/.awg.lock
	flock -n 200 || { say "start уже выполняется — выхожу"; return 0; }
	local backend
	backend=$(awg_backend)
	if [ "$backend" = none ]; then
		say "AmneziaWG недоступен: нет ни kmod-amneziawg, ни $GO_BIN — awg-ноды пропущены"
		return 1
	fi
	if ! have_tools; then
		say "amneziawg-tools (утилита awg) не установлены — awg-ноды недоступны"
		return 1
	fi
	[ "$backend" = kernel ] && \
		{ modprobe amneziawg 2>/dev/null || insmod $(ls /lib/modules/*/amneziawg.ko | head -1) 2>/dev/null; }
	dump_nodes | while IFS='|' read -r idx id server port priv addr ppk psk jc jmin jmax s1 s2 s3 s4 h1 h2 h3 h4 mtu keepalive; do
		[ -n "$id" ] || continue
		if [ -z "$priv" ] || [ -z "$ppk" ] || [ -z "$server" ] || [ -z "$port" ]; then
			say "нода $id: неполные поля (private_key/peer_public_key/endpoint) — пропускаю"
			continue
		fi
		ifname="awg-$id"
		mark=$((29000 + idx))
		conf=$RUN_DIR/$ifname.conf
		write_conf $conf "$priv" "$ppk" "$psk" "$server" "$port" \
			"$jc" "$jmin" "$jmax" "$s1" "$s2" "$s3" "$s4" \
			"$h1" "$h2" "$h3" "$h4" "$keepalive"

		if [ "$backend" = kernel ]; then
			ip link del dev $ifname 2>/dev/null
			if ! ip link add dev $ifname type amneziawg 2>/dev/null; then
				say "нода $id: ip link add type amneziawg не удался — kmod загружен?"
				continue
			fi
		else
			if ! start_go_daemon "$id" "$ifname"; then
				continue
			fi
		fi
		if ! awg setconf $ifname $conf; then
			say "нода $id: awg setconf отверг конфиг — пропускаю"
			if [ "$backend" = kernel ]; then
				ip link del dev $ifname 2>/dev/null
			else
				stop_go_daemon "$ifname"
			fi
			continue
		fi
		oldifs=$IFS; IFS=','
		for a in $addr; do
			[ -n "$a" ] && ip address add "$a" dev $ifname 2>/dev/null
		done
		IFS=$oldifs
		[ -n "$mtu" ] && ip link set dev $ifname mtu $mtu
		ip link set dev $ifname up
		# policy routing для bind_interface+fwmark из движка прокси
		ip rule add fwmark $mark lookup $mark pref $mark 2>/dev/null
		ip route add default dev $ifname table $mark 2>/dev/null
		say "нода $id: интерфейс $ifname поднят (backend=$backend, mark/table $mark)"
	done
	return 0
}

stop() {
	dump_nodes | while IFS='|' read -r idx id rest; do
		[ -n "$id" ] || continue
		ifname="awg-$id"
		mark=$((29000 + idx))
		ip rule del fwmark $mark lookup $mark pref $mark 2>/dev/null
		ip route flush table $mark 2>/dev/null
		stop_go_daemon "$ifname"
		ip link del dev $ifname 2>/dev/null
		rm -f $RUN_DIR/$ifname.conf
	done
	return 0
}

status() {
	local backend
	backend=$(awg_backend)
	echo "kmod-amneziawg: $(have_kmod && echo есть || echo НЕТ)"
	echo "amneziawg-go: $(have_go && echo есть || echo НЕТ)"
	have_tools && echo "amneziawg-tools: есть" || echo "amneziawg-tools: НЕТ"
	echo "backend: $backend"
	[ "$backend" = none ] && return 1
	dump_nodes | while IFS='|' read -r idx id rest; do
		[ -n "$id" ] || continue
		local extra=''
		local gopid
		gopid=$(go_find_pid "awg-$id" 2>/dev/null)
		[ -n "$gopid" ] && extra=" (демон amneziawg-go жив, pid $gopid)"
		if ip link show dev "awg-$id" >/dev/null 2>&1; then
			echo "нода $id: интерфейс awg-$id UP$extra"
		else
			echo "нода $id: интерфейс awg-$id отсутствует$extra"
		fi
	done
	return 0
}

case "$1" in
	start) start ;;
	stop) stop ;;
	status) status ;;
	*) echo "usage: $0 start|stop|status" >&2; exit 1 ;;
esac
