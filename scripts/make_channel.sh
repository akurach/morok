#!/bin/bash
# make_channel.sh — генерация манифестов канала обновлений Морок.
#
# Использование:
#   scripts/make_channel.sh <tag> [repo-slug]
#   scripts/make_channel.sh v0.2.0 akurach/morok
#
# Вход:
#   build/out/*.ipk, *.apk            — пакеты текущего релиза (sha256 считается здесь)
#   luci-app-morok/binaries/<arch>/*  — вендорные бинари (версии — из binaries/VERSIONS)
#
# Выход (коммитится в репо, раздаётся через jsdelivr):
#   channel/latest.env     — плоские переменные для build/install.sh (sh-sourceable)
#   channel/app.json       — манифест приложения (самообновление, Wave 4.1)
#   channel/binaries.json  — агрегатный индекс компонентов
#   channel/bin/<comp>.json — per-component манифест v2 (per-arch) для bin_update.sh
#
# URL бинарей и пакетов — GitHub release-ассеты (jsdelivr не отдаёт >20 МБ,
# sing-box/xray не пролезают — см. channel/README.md).

set -euo pipefail

TAG="${1:-}"
REPO="${2:-akurach/morok}"
[ -n "$TAG" ] || { echo "usage: $0 <tag> [repo-slug]" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO_ROOT/build/out"
CHAN="$REPO_ROOT/channel"
PKG_DIR="$REPO_ROOT/luci-app-morok"
MAKEFILE="$PKG_DIR/Makefile"

PKG_VERSION="$(sed -n 's/^PKG_VERSION:=//p' "$MAKEFILE" | tr -d '[:space:]')"
PKG_RELEASE="$(sed -n 's/^PKG_RELEASE:=//p' "$MAKEFILE" | tr -d '[:space:]')"
RELEASE="${PKG_VERSION}-${PKG_RELEASE}"
[ "$TAG" = "v$PKG_VERSION" ] || echo "ВНИМАНИЕ: тег $TAG не совпадает с PKG_VERSION=$PKG_VERSION" >&2

DL="https://github.com/$REPO/releases/download/$TAG"
DATE="$(date -u +%Y-%m-%d)"

sha() { shasum -a 256 "$1" | awk '{print $1}'; }

mkdir -p "$CHAN/bin"

# ---------- пакеты ----------
IPK="$(ls "$OUT"/luci-app-morok_${RELEASE}_*.ipk 2>/dev/null | head -1 || true)"
APK="$(ls "$OUT"/luci-app-morok_${PKG_VERSION}-r${PKG_RELEASE}_*.apk 2>/dev/null | head -1 || true)"
[ -n "$IPK" ] || { echo "ОШИБКА: нет ipk для $RELEASE в $OUT — сначала build/build.sh" >&2; exit 1; }

IPK_FILE="$(basename "$IPK")"; IPK_SHA="$(sha "$IPK")"
# arch из имени файла (BSD sed на macOS не умеет \| — поэтому bash-разбор)
ARCH="${IPK_FILE#luci-app-morok_${RELEASE}_}"; ARCH="${ARCH%.ipk}"
[ -n "$ARCH" ] && [ -d "$PKG_DIR/binaries/$ARCH" ] || { echo "ОШИБКА: не удалось определить arch из $IPK_FILE" >&2; exit 1; }

latest="$CHAN/latest.env"
{
	echo "# Канал обновлений Морок — сгенерирован scripts/make_channel.sh, не редактировать."
	echo "# Дата: $DATE, тег: $TAG"
	echo "APP_VERSION=$PKG_VERSION"
	echo "RELEASE=$RELEASE"
	echo "TAG=$TAG"
	echo "IPK_FILE=$IPK_FILE"
	echo "IPK_URL=$DL/$IPK_FILE"
	echo "IPK_SHA256=$IPK_SHA"
} > "$latest"

app_pkg_ipk="\"ipk\": {
    \"file\": \"$IPK_FILE\",
    \"url\": \"$DL/$IPK_FILE\",
    \"sha256\": \"$IPK_SHA\",
    \"arch\": \"$ARCH\",
    \"pm\": \"opkg\",
    \"openwrt\": \"<= 24.x (и GL.iNet 4.x)\"
  }"
app_pkg_apk=""
if [ -n "$APK" ]; then
	APK_FILE="$(basename "$APK")"; APK_SHA="$(sha "$APK")"
	{
		echo "APK_FILE=$APK_FILE"
		echo "APK_URL=$DL/$APK_FILE"
		echo "APK_SHA256=$APK_SHA"
	} >> "$latest"
	app_pkg_apk=",
  \"apk\": {
    \"file\": \"$APK_FILE\",
    \"url\": \"$DL/$APK_FILE\",
    \"sha256\": \"$APK_SHA\",
    \"arch\": \"$ARCH\",
    \"pm\": \"apk\",
    \"openwrt\": \">= 25.x\"
  }"
fi

cat > "$CHAN/app.json" <<EOF
{
  "app": "luci-app-morok",
  "channel": "stable",
  "version": "$PKG_VERSION",
  "release": "$RELEASE",
  "tag": "$TAG",
  "released_at": "$DATE",
  "release_page": "https://github.com/$REPO/releases/tag/$TAG",
  "min_openwrt": "23.05",
  "notes": "Релиз $PKG_VERSION. Пакеты и компоненты — на странице релиза, манифесты канала доступны через CDN.",
  $app_pkg_ipk$app_pkg_apk
}
EOF

# ---------- вендорные бинари (per-component манифесты v2) ----------
BIN_DIR="$PKG_DIR/binaries/$ARCH"
VERSIONS="$PKG_DIR/binaries/VERSIONS"

bver() { # версия компонента из VERSIONS (формат: name | version | ...); только первый токен
	awk -F'|' -v n="$1" '$1 ~ "^[[:space:]]*"n"[[:space:]]*$" { gsub(/^[ \t]+|[ \t]+$/, "", $2); split($2, a, /[ \t]/); print a[1]; exit }' "$VERSIONS"
}

index_entries=""
for bin in "$BIN_DIR"/*; do
	name="$(basename "$bin")"
	case "$name" in README*) continue ;; esac
	[ -f "$bin" ] || continue
	v="$(bver "$name")"
	[ -n "$v" ] || { echo "ВНИМАНИЕ: нет версии для $name в VERSIONS — пропускаю" >&2; continue; }
	s="$(sha "$bin")"
	asset="${name}-${v}_${ARCH}"
	cat > "$CHAN/bin/$name.json" <<EOF
{
  "component": "$name",
  "version": "$v",
  "channel": "stable",
  "updated_at": "$DATE",
  "arch": {
    "$ARCH": {
      "url": "$DL/$asset",
      "sha256": "$s"
    }
  }
}
EOF
	[ -n "$index_entries" ] && index_entries="$index_entries,"
	index_entries="$index_entries
    \"$name\": {
      \"version\": \"$v\",
      \"manifest\": \"channel/bin/$name.json\",
      \"manifest_url\": \"https://cdn.jsdelivr.net/gh/$REPO@main/channel/bin/$name.json\",
      \"arch\": [\"$ARCH\"]
    }"
done

cat > "$CHAN/binaries.json" <<EOF
{
  "format": 2,
  "channel": "stable",
  "updated_at": "$DATE",
  "note": "Агрегатный индекс. bin_update.sh читает per-component манифесты (manifest_url), формат v2 per-arch — см. W3_NOTES_D.md.",
  "components": {$index_entries
  }
}
EOF

echo "==> Канал сгенерирован:"
ls -la "$CHAN" "$CHAN/bin"
