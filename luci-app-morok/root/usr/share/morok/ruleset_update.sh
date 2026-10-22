#!/bin/sh
# ruleset_update.sh — обновление rule-sets и внешних источников списков.
#
# Режимы:
#   ruleset_update.sh all         — core .srs + все ВКЛЮЧЁННЫЕ source-секции
#   ruleset_update.sh auto        — cron-режим: .srs раз в сутки; каждый
#                                   source — когда истёк его update_interval
#   ruleset_update.sh <id>        — обновить один источник прямо сейчас
#
# Источники source (UCI): enabled, url, update_interval; last_update пишем
# в UCI (как subscription.last_update — редкая запись, флеш не страдает).
# Скачанный список конвертируется lst2srs.sh в source-JSON в tmpfs
# (/var/etc/morok/lists/<id>.json) — его подхватывает gen_config.uc.
#
# Источник .srs: jsdelivr (зеркало GitHub), т.к. raw.githubusercontent.com
# из РФ деградирует/блокируется. Любой URL сначала тянем напрямую,
# при неудаче — через локальный туннель (127.0.0.1:7890).

CONF=morok
SRS_DIR=/usr/share/morok/rulesets
LIST_DIR=/var/etc/morok/lists
SRS_STAMP=/var/etc/morok/.srs_stamp
LOG=/tmp/log/morok.log
PROXY=http://127.0.0.1:7890
SRS_TTL=86400
SETS="geosite-youtube geosite-discord geosite-meta geosite-category-ru geosite-category-ads-all geoip-ru"

log() { echo "$(date '+%H:%M:%S') rulesets: $*" >>$LOG; logger -t morok-rulesets "$*"; }

# fetch <url> <out>: напрямую, при неудаче — через туннель
fetch() {
	curl -sL -m 40 -o "$2" "$1" 2>/dev/null && [ -s "$2" ] && return 0
	curl -sL -m 40 -x "$PROXY" -o "$2" "$1" 2>/dev/null && [ -s "$2" ]
}

update_srs() {
	mkdir -p $SRS_DIR
	local f repo url ok=0 fail=0
	for f in $SETS; do
		case "$f" in geoip-*) repo="sing-geoip";; *) repo="sing-geosite";; esac
		url="https://cdn.jsdelivr.net/gh/SagerNet/$repo@rule-set/$f.srs"
		if fetch "$url" "$SRS_DIR/.$f.srs.tmp" && head -c 3 "$SRS_DIR/.$f.srs.tmp" | grep -q SRS; then
			mv "$SRS_DIR/.$f.srs.tmp" "$SRS_DIR/$f.srs"
			ok=$((ok+1))
		else
			rm -f "$SRS_DIR/.$f.srs.tmp"
			fail=$((fail+1))
			log "$f: не скачался — оставляю старый"
		fi
	done
	[ "$ok" -gt 0 ] && date +%s >$SRS_STAMP
	log "обновление .srs: ok=$ok fail=$fail"
	[ "$fail" -eq 0 ] && [ "$ok" -gt 0 ]
}

update_source() {
	local sid=$1
	[ "$(uci -q get $CONF.$sid.enabled)" = "1" ] || { log "$sid: выключен — пропускаю"; return 0; }
	local url; url=$(uci -q get $CONF.$sid.url)
	if [ -z "$url" ]; then
		log "$sid: не задан url — пропускаю"
		return 1
	fi

	mkdir -p $LIST_DIR
	local tmp=$LIST_DIR/.$sid.lst.tmp
	if ! fetch "$url" "$tmp"; then
		rm -f "$tmp"
		log "$sid: не скачался (ни напрямую, ни через туннель) — оставляю старый"
		return 1
	fi
	if ! /usr/share/morok/lst2srs.sh "$tmp" "$LIST_DIR/$sid.json"; then
		rm -f "$tmp"
		log "$sid: скачанное не похоже на список доменов — оставляю старый"
		return 1
	fi
	rm -f "$tmp"
	uci set $CONF.$sid.last_update="$(date +%s)"
	uci commit $CONF
	log "$sid: обновлён из $url"
	return 0
}

# реальные имена секций (cfgXXXX / именованные) — только через ucode,
# `uci show` на GL-прошивке печатает анонимные секции как @type[N]
list_sources() {
	ucode -e "
		import { cursor } from 'uci';
		let c = cursor(); c.load('$CONF');
		c.foreach('$CONF', 'source', function(s) { print(s['.name'], '\n'); });
	"
}

reload_if_running() {
	pidof sing-box >/dev/null 2>&1 && /etc/init.d/morok reload >/dev/null 2>&1
}

case "$1" in
all)
	update_srs
	changed=0
	for sid in $(list_sources); do
		update_source "$sid" && changed=1
	done
	[ "$changed" = 1 ] && reload_if_running
	;;
auto)
	mkdir -p $LIST_DIR /tmp/log
	now=$(date +%s)
	# core .srs — не чаще раза в сутки
	last=0
	[ -f "$SRS_STAMP" ] && last=$(cat $SRS_STAMP)
	[ $((now - last)) -ge "$SRS_TTL" ] && update_srs
	# источники — по своему update_interval
	changed=0
	for sid in $(list_sources); do
		[ "$(uci -q get $CONF.$sid.enabled)" = "1" ] || continue
		iv=$(uci -q get $CONF.$sid.update_interval); iv=${iv:-86400}
		lu=$(uci -q get $CONF.$sid.last_update); lu=${lu:-0}
		if [ $((now - lu)) -ge "$iv" ] || [ ! -f "$LIST_DIR/$sid.json" ]; then
			update_source "$sid" && changed=1
		fi
	done
	[ "$changed" = 1 ] && reload_if_running
	;;
'')
	echo "usage: $0 {all|auto|<source-id>}"; exit 1
	;;
*)
	c=$(uci -q get $CONF.$1) || { log "$1: источник не найден"; exit 1; }
	update_source "$1" && reload_if_running
	;;
esac
exit 0
