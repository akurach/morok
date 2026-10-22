#!/bin/sh
# uninstall.sh — чистый снос luci-app-morok со следами.
#
#   sh uninstall.sh           — удалить пакет, КОНФИГ СОХРАНИТЬ (/etc/config/morok)
#   sh uninstall.sh --purge   — удалить пакет И конфиг
#
# Что чистится помимо файлов пакета:
#   - nft table inet morok + policy routing (fwmark 0x1, table 100)
#   - cron-задачи morok (subscribe/ruleset_update)
#   - runtime: /var/etc/morok, пид-файлы, лог-кэш
#   - LuCI/rpcd кэши

set -e

PKG="luci-app-morok"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

echo "==> Останавливаю сервис"
/etc/init.d/morok stop 2>/dev/null || true
/etc/init.d/morok disable 2>/dev/null || true
# guardian мог остаться демоном вне procd
[ -f /var/etc/morok/guardian.pid ] && kill "$(cat /var/etc/morok/guardian.pid)" 2>/dev/null || true
killall nfqws2 2>/dev/null || true

echo "==> Удаляю пакет"
if command -v opkg >/dev/null 2>&1; then
	if [ "$PURGE" = "1" ]; then
		MOROK_PURGE=1 opkg remove "$PKG" || true
	else
		opkg remove "$PKG" || true
	fi
elif command -v apk >/dev/null 2>&1; then
	[ "$PURGE" = "1" ] && export MOROK_PURGE=1
	apk del "$PKG" || true
else
	echo "uninstall.sh: ни opkg, ни apk не найдены — чищу только следы" >&2
fi

echo "==> Чищу nft и policy routing"
nft delete table inet morok 2>/dev/null || true
ip rule del fwmark 0x1/0x1 lookup 100 pref 100 2>/dev/null || true
ip route del local 0.0.0.0/0 dev lo table 100 2>/dev/null || true

echo "==> Чищу cron"
if [ -f /etc/crontabs/root ]; then
	grep -v 'share/morok' /etc/crontabs/root > /tmp/crontab.morok-clean 2>/dev/null || true
	if ! cmp -s /etc/crontabs/root /tmp/crontab.morok-clean; then
		cp /tmp/crontab.morok-clean /etc/crontabs/root
		/etc/init.d/cron restart 2>/dev/null || true
	fi
	rm -f /tmp/crontab.morok-clean
fi

echo "==> Чищу runtime и кэши"
rm -rf /var/etc/morok /tmp/morok-install
rm -f /tmp/luci-indexcache /tmp/luci-indexcache.*
rm -rf /tmp/luci-modulecache

if [ "$PURGE" = "1" ]; then
	echo "==> PURGE: удаляю конфиг"
	rm -f /etc/config/morok /etc/config/morok-opkg /etc/config/morok.bak
	rm -f /tmp/log/morok.log
	uci -q delete ucitrack.@morok[-1] 2>/dev/null && uci commit ucitrack || true
else
	echo "==> Конфиг /etc/config/morok сохранён (полный снос: sh uninstall.sh --purge)"
fi

/etc/init.d/rpcd reload 2>/dev/null || true

echo "==> Готово. Остатки файлов пакета (если были):"
ls /usr/share/morok /usr/lib/morok /usr/libexec/rpcd/morok 2>/dev/null || echo "    (чисто)"
