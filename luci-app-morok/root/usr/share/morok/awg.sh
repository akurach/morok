#!/bin/sh
# awg.sh start|stop|status — системные интерфейсы AmneziaWG для нод type=awg.
#
# Модель: amnezia-жunk-параметры (Jc/Jmin/Jmax/S1..S4/H1..H4) — ядерная
# фича kmod-amneziawg, её не выразить ни в sing-box wireguard-outbound,
# ни в xray. Поэтому нода awg = системный интерфейс awg-<id секции>,
# а движок прокси заворачивает в него трафик через direct/freedom
# outbound с bind_interface + fwmark (gen_config.uc / xray_gen.uc).
#
# Маршрутизация: mark = 29000 + <порядковый номер awg-ноды в UCI> (тот же
# порядок foreach используют генераторы — формула общая, см. W3_NOTES_C.md);
# ip rule fwmark → отдельная table с default dev <if>. Основная таблица
# не трогается, kill switch и tproxy работают как раньше.
#
# Без kmod-amneziawg/amneziawg-tools — понятная ошибка в лог, rc=1;
# сервис morok из-за этого не падает (init вызывает нас с || true).

CONF=morok
RUN_DIR=/var/etc/morok
LOG_TAG=morok-awg

say() { logger -t $LOG_TAG "$*"; echo "$*"; }

have_kmod() {
	lsmod 2>/dev/null | awk '$1=="amneziawg"{f=1} END{exit !f}' && return 0
	ls /lib/modules/*/amneziawg.ko >/dev/null 2>&1
}

have_tools() { command -v awg >/dev/null 2>&1; }

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

start() {
	if ! have_kmod; then
		say "kmod-amneziawg не установлен — awg-ноды недоступны (тип ноды awg требует пакеты kmod-amneziawg + amneziawg-tools)"
		return 1
	fi
	modprobe amneziawg 2>/dev/null || insmod $(ls /lib/modules/*/amneziawg.ko | head -1) 2>/dev/null
	if ! have_tools; then
		say "amneziawg-tools (утилита awg) не установлены — awg-ноды недоступны"
		return 1
	fi
	mkdir -p $RUN_DIR
	dump_nodes | while IFS='|' read -r idx id server port priv addr ppk psk jc jmin jmax s1 s2 s3 s4 h1 h2 h3 h4 mtu keepalive; do
		[ -n "$id" ] || continue
		if [ -z "$priv" ] || [ -z "$ppk" ] || [ -z "$server" ] || [ -z "$port" ]; then
			say "нода $id: неполные поля (private_key/peer_public_key/endpoint) — пропускаю"
			continue
		fi
		ifname="awg-$id"
		mark=$((29000 + idx))
		conf=$RUN_DIR/$ifname.conf
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

		ip link del dev $ifname 2>/dev/null
		if ! ip link add dev $ifname type amneziawg 2>/dev/null; then
			say "нода $id: ip link add type amneziawg не удался — kmod загружен?"
			continue
		fi
		if ! awg setconf $ifname $conf; then
			say "нода $id: awg setconf отверг конфиг — пропускаю"
			ip link del dev $ifname 2>/dev/null
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
		say "нода $id: интерфейс $ifname поднят (mark/table $mark)"
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
		ip link del dev $ifname 2>/dev/null
		rm -f $RUN_DIR/$ifname.conf
	done
	return 0
}

status() {
	if ! have_kmod; then
		echo "kmod-amneziawg: НЕТ"
		return 1
	fi
	echo "kmod-amneziawg: есть"
	have_tools && echo "amneziawg-tools: есть" || echo "amneziawg-tools: НЕТ"
	dump_nodes | while IFS='|' read -r idx id rest; do
		[ -n "$id" ] || continue
		if ip link show dev "awg-$id" >/dev/null 2>&1; then
			echo "нода $id: интерфейс awg-$id UP"
		else
			echo "нода $id: интерфейс awg-$id отсутствует"
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
