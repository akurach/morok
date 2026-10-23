#!/bin/sh
# shoot.sh — регенерация скриншотов docs/screenshots/ через оффлайн-стенд.
# Запуск из корня репо: sh tools/screenshots/shoot.sh
# Требует: Google Chrome (headless), python3 с Pillow.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/docs/screenshots"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

[ -x "$CHROME" ] || { echo "Chrome не найден: $CHROME" >&2; exit 1; }

mkdir -p "$OUT" "$OUT/.raw"

# свободный порт — 8931 могут занять другие стенды
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')

python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1

# убеждаемся, что отвечает именно наш сервер
curl -sf "http://127.0.0.1:$PORT/tools/screenshots/harness.html" -o /dev/null || {
	echo "Сервер на :$PORT не отдаёт harness.html" >&2; exit 1; }

shoot() { # view file height [lang]
	local lang="${4:-ru}"
	local url="http://127.0.0.1:$PORT/tools/screenshots/harness.html?view=$1"
	[ "$lang" = "en" ] && url="$url&lang=en"
	echo "  → $2 ($1, $lang)"
	"$CHROME" --headless --disable-gpu --hide-scrollbars \
		--lang="$([ "$lang" = "en" ] && echo en-US || echo ru-RU)" \
		--accept-lang="$([ "$lang" = "en" ] && echo en-US || echo ru-RU)" \
		--force-device-scale-factor=1 \
		--window-size="1600,$3" \
		--virtual-time-budget=15000 \
		--screenshot="$OUT/.raw/$2" \
		"$url" >/dev/null 2>&1
}

shoot dashboard  dashboard.png   2500
shoot nodes      nodes.png       1600
shoot routing    routing.png     1900
shoot devices    devices.png     1200
shoot market     market.png      1500
shoot antidpi    optimization.png 2100
shoot components components.png  1300
# английская версия интерфейса (?lang=en)
shoot dashboard  dashboard-en.png   2500 en
shoot market     market-en.png      1500 en
shoot antidpi    optimization-en.png 2100 en

kill $SRV 2>/dev/null
trap - EXIT

python3 "$ROOT/tools/screenshots/trim.py" "$OUT"
echo "Готово: $OUT"
