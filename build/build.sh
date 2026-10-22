#!/bin/bash
# build.sh — сборка luci-app-morok без OpenWrt SDK.
#
# Форматы:
#   ipk (OpenWrt ≤24.x, opkg) = tar.gz { debian-binary, control.tar.gz, data.tar.gz }
#   apk (OpenWrt 25+, apk v3) = ADB-контейнер, собирается ТОЛЬКО через
#                               `apk mkpkg` (apk-tools ≥ 3.0). Руками tar'ом
#                               не собрать — формат не tar (см. W3_NOTES_D.md).
#
# Использование:
#   ./build/build.sh                       # ipk, архитектура aarch64_cortex-a53
#   ./build/build.sh <arch>                # ipk для другой архитектуры
#   ./build/build.sh <arch> --apk          # ipk + apk
#   ./build/build.sh <arch> --apk-only     # только apk
#
# apk-сборка (в порядке приоритета):
#   1) host `apk` с апплетом mkpkg (apk-tools ≥ 3.0, напр. Alpine ≥ 3.23);
#   2) docker: образ $APK_DOCKER_IMAGE (default alpine:latest) — на macOS
#      работает из коробки, rootfs монтируется в контейнер.
#
# Подпись apk (опционально): APK_SIGN_KEY=/path/morok.apk.private.pem
#   Публичный ключ кладётся на роутер в /etc/apk/keys/ — тогда --allow-untrusted
#   не нужен. Без ключа пакет ставится с `apk add --allow-untrusted`.
#
# macOS-ньюансы учтены: COPYFILE_DISABLE=1, вычистка ._* и .DS_Store,
# bsdtar с явным root:root (для ipk), Darwin ar не используется.

set -euo pipefail
export COPYFILE_DISABLE=1

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$REPO_ROOT/luci-app-morok"
MAKEFILE="$PKG_DIR/Makefile"

ARCH="aarch64_cortex-a53"
FMT="ipk"
for a in "$@"; do
	case "$a" in
		--apk)      FMT="all" ;;
		--apk-only) FMT="apk" ;;
		--ipk)      FMT="ipk" ;;
		-*) echo "ОШИБКА: неизвестный флаг $a" >&2; exit 1 ;;
		*)  ARCH="$a" ;;
	esac
done

PKG_NAME="luci-app-morok"
PKG_VERSION="$(sed -n 's/^PKG_VERSION:=//p' "$MAKEFILE" | tr -d '[:space:]')"
PKG_RELEASE="$(sed -n 's/^PKG_RELEASE:=//p' "$MAKEFILE" | tr -d '[:space:]')"
VERSION="${PKG_VERSION}-${PKG_RELEASE}"
APK_VERSION="${PKG_VERSION}-r${PKG_RELEASE}"

# зависимости — единый список для ipk (Depends) и apk (depends)
DEPS="luci-base rpcd ucode curl ca-bundle firewall4 kmod-nfnetlink-queue kmod-nft-queue kmod-nft-tproxy"
DEPS_IPK="$(echo $DEPS | sed 's/ /, /g')"
DESCRIPTION="Морок — продвинутая маршрутизация и оптимизация трафика: прозрачный прокси на sing-box (вендорный бинарь в комплекте), пул нод, правила маршрутизации, фоллбэк-цепочки, kill switch, оптимизация доставки пакетов (nfqws2 в комплекте)."

BIN_DIR="$PKG_DIR/binaries/$ARCH"
[ -d "$BIN_DIR" ] || { echo "ОШИБКА: нет каталога бинарей $BIN_DIR" >&2; exit 1; }
[ -f "$BIN_DIR/sing-box" ] || { echo "ОШИБКА: $BIN_DIR/sing-box не найден" >&2; exit 1; }

OUT_DIR="$REPO_ROOT/build/out"
# WORK внутри build/ (а не в $TMPDIR): /var/folders macOS недоступен
# docker file sharing, а для apk-сборки WORK монтируется в контейнер
WORK="$(mktemp -d "$REPO_ROOT/build/.work.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

DATA="$WORK/data"
CTRL="$WORK/control"
mkdir -p "$DATA" "$CTRL" "$OUT_DIR"

echo "==> Собираю $PKG_NAME $VERSION для $ARCH (формат: $FMT)"

# ---------- data ----------
# root/ -> /
( cd "$PKG_DIR/root" && find . -type f ! -name '.DS_Store' ! -name '._*' -print0 | \
    while IFS= read -r -d '' f; do
      mkdir -p "$DATA/$(dirname "$f")"
      cp "$f" "$DATA/$f"
    done )

# htdocs/luci-static/resources/... -> /www/luci-static/resources/...
( cd "$PKG_DIR/htdocs" && find . -type f ! -name '.DS_Store' ! -name '._*' -print0 | \
    while IFS= read -r -d '' f; do
      mkdir -p "$DATA/www/$(dirname "$f")"
      cp "$f" "$DATA/www/$f"
    done )

# rulesets/ (корень репо) -> /usr/share/morok/rulesets/
if [ -d "$REPO_ROOT/rulesets" ]; then
  mkdir -p "$DATA/usr/share/morok/rulesets"
  ( cd "$REPO_ROOT/rulesets" && find . -type f ! -name '.DS_Store' ! -name '._*' -exec cp {} "$DATA/usr/share/morok/rulesets/" \; )
fi

# binaries/<arch>/ -> /usr/lib/morok/bin/
mkdir -p "$DATA/usr/lib/morok/bin"
( cd "$BIN_DIR" && find . -type f ! -name '.DS_Store' ! -name '._*' ! -name 'README*' -exec cp {} "$DATA/usr/lib/morok/bin/" \; )

# права
find "$DATA" -type f -exec chmod 644 {} \;
chmod 755 "$DATA/usr/lib/morok/bin/"* 2>/dev/null || true
chmod 755 "$DATA/etc/init.d/morok" 2>/dev/null || true
chmod 755 "$DATA/usr/libexec/rpcd/"* 2>/dev/null || true
# скрипты и ucode вызываются напрямую — exec-биты обязательны
chmod 755 "$DATA/usr/share/morok/"*.sh "$DATA/usr/share/morok/"*.uc 2>/dev/null || true
chmod 755 "$DATA/usr/share/morok/"*.sh 2>/dev/null || true
find "$DATA" -type d -exec chmod 755 {} \;

INSTALLED_SIZE="$(du -sk "$DATA" | awk '{print $1}')"

# ---------- скрипты пакета (общие для ipk и apk) ----------
# ipk: postinst/prerm/postrm в control.tar.gz
# apk: post-install/pre-deinstall/post-deinstall через mkpkg --script
#
# ВАЖНО (урок 14): opkg при upgrade вызывает postrm старого пакета.
# В apk v3 на upgrade вызываются pre-upgrade/post-upgrade НОВОГО пакета,
# deinstall-скрипты старого НЕ выполняются; на всякий случай гардим
# post-deinstall ещё и по $PKG_UPGRADE (apk экспортирует его при upgrade).

cat > "$CTRL/postinst" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
chmod 755 /usr/lib/morok/bin/* 2>/dev/null
# rpcd кэширует скрипты, LuCI кэширует индекс — сбрасываем
/etc/init.d/rpcd reload 2>/dev/null
rm -f /tmp/luci-indexcache /tmp/luci-indexcache.* 2>/dev/null
rm -rf /tmp/luci-modulecache 2>/dev/null
# стартуем только если конфиг на месте (свежая установка или upgrade с конфигом);
# если в конфиге globals.enabled=0 — init сам выйдет без последствий
if [ -f /etc/config/morok ]; then
	/etc/init.d/morok enable 2>/dev/null
	/etc/init.d/morok start 2>/dev/null
fi
exit 0
EOF

cat > "$CTRL/prerm" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
/etc/init.d/morok stop 2>/dev/null
/etc/init.d/morok disable 2>/dev/null
exit 0
EOF

cat > "$CTRL/postrm" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
# runtime-следы сносим только при удалении; при upgrade сохраняем (списки, кэши).
# opkg: upgrade приходит в $1; apk: deinstall-скрипты при upgrade не вызываются,
# но страхуемся по PKG_UPGRADE.
if [ "$1" != "upgrade" ] && [ "${PKG_UPGRADE:-0}" != "1" ]; then
	rm -rf /var/etc/morok 2>/dev/null
	nft delete table inet morok 2>/dev/null
	ip rule del fwmark 0x1/0x1 lookup 100 pref 100 2>/dev/null
	ip route del local 0.0.0.0/0 dev lo table 100 2>/dev/null
fi
rm -rf /tmp/luci-modulecache 2>/dev/null
rm -f /tmp/luci-indexcache /tmp/luci-indexcache.* 2>/dev/null
# /etc/config/morok по умолчанию СОХРАНЯЕМ (данные пользователя).
# Полный снос: MOROK_PURGE=1 opkg remove luci-app-morok (apk: apk del + purge-скрипт)
if [ "${MOROK_PURGE:-0}" = "1" ]; then
	rm -f /etc/config/morok /etc/config/morok-opkg /etc/config/morok.bak
fi
/etc/init.d/rpcd reload 2>/dev/null
exit 0
EOF

chmod 755 "$CTRL/postinst" "$CTRL/prerm" "$CTRL/postrm"

# ---------- ipk ----------
build_ipk() {
	cat > "$CTRL/control" <<EOF
Package: $PKG_NAME
Version: $VERSION
Architecture: $ARCH
Maintainer: Morok Project
Installed-Size: $INSTALLED_SIZE
Depends: $DEPS_IPK
Section: luci
Category: LuCI
License: GPL-3.0
Description: Морок — продвинутая маршрутизация и оптимизация трафика:
 прозрачный прокси на sing-box (вендорный бинарь в комплекте), пул нод,
 правила маршрутизации, фоллбэк-цепочки, kill switch,
 оптимизация доставки пакетов (nfqws2 в комплекте).
EOF
	# конфиг не трогаем при upgrade
	echo "/etc/config/morok" > "$CTRL/conffiles"
	chmod 644 "$CTRL/control" "$CTRL/conffiles"

	# bsdtar: явный root:root, без расширенных атрибутов macOS
	( cd "$DATA" && bsdtar --uid 0 --gid 0 --uname root --gname root \
	    --no-xattrs --no-acls --no-fflags \
	    -czf "$WORK/data.tar.gz" . )
	( cd "$CTRL" && bsdtar --uid 0 --gid 0 --uname root --gname root \
	    --no-xattrs --no-acls --no-fflags \
	    -czf "$WORK/control.tar.gz" . )

	echo "2.0" > "$WORK/debian-binary"

	local ipk="$OUT_DIR/${PKG_NAME}_${VERSION}_${ARCH}.ipk"
	rm -f "$ipk"
	# Формат контейнера — как у официальных пакетов OpenWrt 24.10:
	# ipk = tar.gz с членами ./debian-binary ./control.tar.gz ./data.tar.gz
	# (opkg 24.10 НЕ принимает классический ar-контейнер — "Malformed package file";
	#  ar-вариант собирать на macOS и вовсе нечем: Darwin ar затирает членов __.SYMDEF).
	( cd "$WORK" && bsdtar --uid 0 --gid 0 --uname root --gname root \
	    --no-xattrs --no-acls --no-fflags \
	    -czf "$ipk" ./debian-binary ./control.tar.gz ./data.tar.gz )
	echo "==> ipk: $ipk"
}

# ---------- apk (OpenWrt 25+) ----------
build_apk() {
	local adata="$WORK/adata"
	local scripts="$WORK/apk-scripts"
	mkdir -p "$adata" "$scripts"
	cp -R "$DATA/" "$adata/"

	# книга учёта файлов по конвенции OpenWrt (lib/apk/packages/<pkg>.*):
	# .list — список файлов; .conffiles — конфиги, переживающие upgrade;
	# .conffiles_static — конфиги + sha256 (использует sysupgrade)
	local meta="$adata/lib/apk/packages"
	mkdir -p "$meta"
	( cd "$adata" && find . -type f ! -path './lib/apk/packages/*' -printf '/%P\n' 2>/dev/null | sort > "$meta/$PKG_NAME.list" ) || \
	( cd "$adata" && find . -type f ! -path './lib/apk/packages/*' | sed 's|^\.||' | sort > "$meta/$PKG_NAME.list" )
	echo "/etc/config/morok" > "$meta/$PKG_NAME.conffiles"
	if [ -f "$adata/etc/config/morok" ]; then
		local csum
		csum="$(shasum -a 256 "$adata/etc/config/morok" | awk '{print $1}')"
		echo "/etc/config/morok $csum" > "$meta/$PKG_NAME.conffiles_static"
	fi

	# apk-скрипты из общих тел
	cp "$CTRL/postinst" "$scripts/post-install"
	cp "$CTRL/prerm"    "$scripts/pre-deinstall"
	cp "$CTRL/postrm"   "$scripts/post-deinstall"
	# upgrade: как у OpenWrt package-pack.mk — PKG_UPGRADE=1 + тело postinst
	{ echo '#!/bin/sh'; echo 'export PKG_UPGRADE=1'; sed '/^#!\/bin\/sh/d' "$CTRL/postinst"; } > "$scripts/post-upgrade"
	{ echo '#!/bin/sh'; echo 'export PKG_UPGRADE=1'; } > "$scripts/pre-upgrade"
	chmod 755 "$scripts"/*

	# где взять apk с mkpkg: host или docker
	local runner=host
	if command -v apk >/dev/null 2>&1 && apk mkpkg --help >/dev/null 2>&1; then
		runner=host
	elif command -v docker >/dev/null 2>&1; then
		runner=docker
	else
		echo "ОШИБКА: для сборки .apk нужен apk-tools ≥ 3.0 (апплет mkpkg) или docker." >&2
		echo "        macOS: brew нет apk-tools — поставь Docker Desktop, всё остальное автоматически." >&2
		exit 1
	fi

	local apk="$OUT_DIR/${PKG_NAME}_${APK_VERSION}_${ARCH}.apk"
	rm -f "$apk"
	[ -n "${APK_SIGN_KEY:-}" ] && cp "$APK_SIGN_KEY" "$WORK/sign.key"

	# скрипт, который выполняется внутри окружения с apk mkpkg
	cat > "$WORK/mkpkg.sh" <<MKEOF
#!/bin/sh
set -e
chown -R 0:0 /work/adata 2>/dev/null || true
apk mkpkg \\
	--info "name:$PKG_NAME" \\
	--info "version:$APK_VERSION" \\
	--info "description:$DESCRIPTION" \\
	--info "arch:$ARCH" \\
	--info "license:GPL-3.0" \\
	--info "origin:$PKG_NAME" \\
	--info "maintainer:Morok Project" \\
	--info "depends:$DEPS" \\
	--script "pre-upgrade:/work/apk-scripts/pre-upgrade" \\
	--script "post-upgrade:/work/apk-scripts/post-upgrade" \\
	--script "post-install:/work/apk-scripts/post-install" \\
	--script "pre-deinstall:/work/apk-scripts/pre-deinstall" \\
	--script "post-deinstall:/work/apk-scripts/post-deinstall" \\
	--files /work/adata \\
	--no-xattrs \\
	${APK_SIGN_KEY:+--sign-key /work/sign.key }\\
	--output /work/out.apk
# возвращаем владельца хоста: на Linux-раннерах bind-mount пробрасывает
# uid как есть, и chown 0:0 выше иначе делает WORK неудаляемым для
# cleanup-trap'а (Permission denied на rm -rf). На macOS Docker Desktop
# маппинг uid'ов это не ломает.
HOST_OWN="\$(stat -c '%u:%g' /work 2>/dev/null || echo '')"
[ -n "\$HOST_OWN" ] && chown -R "\$HOST_OWN" /work 2>/dev/null || true
MKEOF
	chmod 755 "$WORK/mkpkg.sh"

	if [ "$runner" = "host" ]; then
		( cd "$WORK" && sed 's|/work|'"$WORK"'|g' mkpkg.sh > mkpkg-host.sh && \
		  sh mkpkg-host.sh ) || { echo "ОШИБКА: apk mkpkg не отработал" >&2; exit 1; }
	else
		local img="${APK_DOCKER_IMAGE:-alpine:latest}"
		echo "==> apk mkpkg через docker ($img)"
		docker run --rm -v "$WORK:/work" "$img" sh /work/mkpkg.sh \
			|| { echo "ОШИБКА: apk mkpkg в docker не отработал" >&2; exit 1; }
	fi
	mv "$WORK/out.apk" "$apk"
	echo "==> apk: $apk"
}

case "$FMT" in
	ipk) build_ipk ;;
	apk) build_apk ;;
	all) build_ipk; build_apk ;;
esac

echo
echo "==> Артефакты в $OUT_DIR:"
ls -la "$OUT_DIR"
