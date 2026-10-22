#!/bin/sh
# device_routes.sh — заполнение nft-сета per-device маршрутизации из UCI.
# Дёргается init-скриптом после применения morok.nft.
# Только route=direct (мимо tproxy, по MAC); route=proxy|node:* обслуживает
# sing-box через source_ip-правило (см. gen_config.uc).

CONF=morok
SET=morok_dev_direct

# таблицы может ещё не быть (transparent=0) — тогда и делать нечего
nft list set inet morok $SET >/dev/null 2>&1 || exit 0

nft flush set inet morok $SET

# имена секций через ucode: `uci show` на GL-прошивке печатает анонимные
# секции как @device[N], парсить его нельзя
macs=$(ucode -e "
import { cursor } from 'uci';
let c = cursor(); c.load('$CONF');
let out = [];
c.foreach('$CONF', 'device', function(s) {
	if (s.enabled == '1' && s.route == 'direct' && s.mac)
		push(out, lc(s.mac));
});
print(join(', ', out));
")

[ -n "$macs" ] && nft add element inet morok $SET "{ $macs }"
exit 0
