#!/bin/sh
# Morok metrics collector — лёгкий демон-сборщик (Wave 3.5).
# Singleton через flock на fd 200 (урок 13 ТЗ; fd 9 не используем).
# Раз в metrics_interval секунд (UCI morok.globals.metrics_interval, дефолт 60)
# дёргает metrics_tick.uc, который атомарно обновляет /var/etc/morok/metrics.json.
# Запускается лениво из rpcd-плагина morok_metrics при первом обращении;
# после ребута поднимется при первом же опросе дашборда.

LOCK=/var/etc/morok/metrics.lock
exec 200>"$LOCK"
flock -n 200 || exit 0

mkdir -p /var/etc/morok

while true; do
	INTERVAL=$(uci -q get morok.globals.metrics_interval || echo 60)
	case "$INTERVAL" in ''|*[!0-9]*) INTERVAL=60 ;; esac
	[ "$INTERVAL" -lt 10 ] && INTERVAL=10
	/usr/bin/ucode /usr/share/morok/metrics_tick.uc >/dev/null 2>&1
	sleep "$INTERVAL"
done
