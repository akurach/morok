#!/bin/sh
# install.sh — установка luci-app-morok одной командой.
#
# Использование (на роутере):
#   sh install.sh /tmp/luci-app-morok_<ver>_<arch>.ipk   # OpenWrt ≤ 24.x (opkg)
#   sh install.sh /tmp/luci-app-morok_<ver>_<arch>.apk   # OpenWrt 25+ (apk)
#   sh install.sh https://example.com/luci-app-morok.apk # по URL
#
# Установка одной командой (без аргументов — берёт свежий релиз из канала):
#   curl -fsSL https://cdn.jsdelivr.net/gh/akurach/morok@main/build/install.sh | sh
# Канал по умолчанию — jsdelivr (raw.githubusercontent из РФ недоступен).
# Переопределить канал: MOROK_CHANNEL=https://mirror/channel/latest.env sh install.sh
#
# One-liner с рабочей машины:
#   scp luci-app-morok_* root@<router>:/tmp/ && \
#   ssh root@<router> 'sh /tmp/install.sh /tmp/luci-app-morok_*'
#
# Детектирует opkg (OpenWrt ≤24.x) и apk (OpenWrt 25+) и ставит зависимости
# (curl, ca-bundle, kmod-nft-tproxy и др.) до установки самого пакета.

set -e

PKG="luci-app-morok"
SRC="${1:-}"
# userspace-зависимости + kmod'ы (kmod'ы могли не совпасть с ядром кастомной
# прошивки — их неудача не фатальна, пакет сам проверит Depends)
DEPS_USER="curl ca-bundle"
DEPS_KMOD="kmod-nfnetlink-queue kmod-nft-queue kmod-nft-tproxy"

fail() { echo "install.sh: ОШИБКА: $*" >&2; exit 1; }

# --- пакетный менеджер ---
PM=""
if command -v opkg >/dev/null 2>&1; then
	PM=opkg
elif command -v apk >/dev/null 2>&1; then
	PM=apk
elif [ -f /etc/openwrt_release ] && grep -q "DISTRIB_RELEASE='2[5-9]" /etc/openwrt_release 2>/dev/null; then
	PM=apk
fi
[ -n "$PM" ] || fail "не найден ни opkg, ни apk — не OpenWrt?"
echo "==> Пакетный менеджер: $PM"

# --- без аргументов: свежий релиз из канала (jsdelivr по умолчанию) ---
EXPECT_SHA=""
if [ -z "$SRC" ]; then
	CHANNEL="${MOROK_CHANNEL:-https://cdn.jsdelivr.net/gh/akurach/morok@main/channel/latest.env}"
	echo "==> Канал обновлений: $CHANNEL"
	mkdir -p /tmp/morok-install
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL --retry 2 -o /tmp/morok-install/latest.env "$CHANNEL" || fail "манифест канала не скачался"
	elif command -v wget >/dev/null 2>&1; then
		wget -q -O /tmp/morok-install/latest.env "$CHANNEL" || fail "манифест канала не скачался"
	else
		fail "ни curl, ни wget не найдены"
	fi
	# манифест генерируется нами же (scripts/make_channel.sh) — просто source
	. /tmp/morok-install/latest.env
	case "$PM" in
		opkg) SRC="${IPK_URL:-}"; EXPECT_SHA="${IPK_SHA256:-}" ;;
		apk)  SRC="${APK_URL:-}"; EXPECT_SHA="${APK_SHA256:-}" ;;
	esac
	[ -n "$SRC" ] || fail "в манифесте канала нет пакета под $PM"
	echo "==> Канал предлагает версию ${RELEASE:-?}"
fi

# --- скачивание, если URL ---
case "$SRC" in
	http://*|https://*)
		mkdir -p /tmp/morok-install
		# одноимённо .ipk/.apk — берём под менеджер
		DST="/tmp/morok-install/${SRC##*/}"
		echo "==> Скачиваю $SRC"
		if command -v curl >/dev/null 2>&1; then
			curl -fsSL --retry 2 -o "$DST" "$SRC" || fail "скачивание не удалось"
		elif command -v wget >/dev/null 2>&1; then
			wget -q -O "$DST" "$SRC" || fail "скачивание не удалось"
		else
			fail "ни curl, ни wget не найдены"
		fi
		SRC="$DST"
		# контроль целостности, если канал дал sha256
		if [ -n "$EXPECT_SHA" ]; then
			ACT="$(sha256sum "$SRC" | awk '{print $1}')"
			[ "$ACT" = "$EXPECT_SHA" ] || fail "sha256 не сошёлся: ожидалось $EXPECT_SHA, получено $ACT"
			echo "==> sha256 сошёлся ✓"
		fi
		;;
esac

# glob (one-liner выше передаёт /tmp/luci-app-morok_*)
if [ ! -f "$SRC" ]; then
	for f in $SRC; do [ -f "$f" ] && SRC="$f" && break; done
fi
# несколько файлов по glob — выбираем под менеджер
if [ ! -f "$SRC" ]; then
	case "$PM" in
		opkg) for f in ${1:-}.ipk; do [ -f "$f" ] && SRC="$f"; done ;;
		apk)  for f in ${1:-}.apk; do [ -f "$f" ] && SRC="$f"; done ;;
	esac
fi
[ -f "$SRC" ] || fail "файл не найден: $SRC"

# --- формат пакета под менеджер ---
case "$PM:$SRC" in
	opkg:*.ipk|apk:*.apk) : ;;
	opkg:*) fail "для opkg нужен .ipk (собери: ./build/build.sh), получен: ${SRC##*/}" ;;
	apk:*)  fail "для apk нужен .apk (собери: ./build/build.sh --apk), получен: ${SRC##*/}" ;;
esac

# --- проверка архитектуры (мягкая: предупреждаем, не падаем) ---
SYS_ARCH=""
if [ -f /etc/openwrt_release ]; then
	SYS_ARCH="$(sed -n "s/^DISTRIB_ARCH='\(.*\)'/\1/p" /etc/openwrt_release)"
fi
case "$SRC" in
	*"$SYS_ARCH"*) : ;;
	*) [ -n "$SYS_ARCH" ] && echo "install.sh: ВНИМАНИЕ: системная архитектура '$SYS_ARCH', имя пакета не содержит её — проверь, что ставишь нужную сборку" ;;
esac

# --- зависимости (best effort; пакет всё равно проверит Depends) ---
deps_missing() {
	# выводит недостающие пакеты из аргументов
	local p
	for p in "$@"; do
		if [ "$PM" = opkg ]; then
			opkg status "$p" 2>/dev/null | grep -q "^Package: $p$" || echo "$p"
		else
			apk info -e "$p" >/dev/null 2>&1 || echo "$p"
		fi
	done
}

echo "==> Проверяю зависимости"
MISS="$(deps_missing $DEPS_USER $DEPS_KMOD)"
if [ -n "$MISS" ]; then
	echo "==> Ставлю недостающее: $(echo $MISS | tr '\n' ' ')"
	if [ "$PM" = opkg ]; then
		opkg update 2>&1 | tail -1 || true
		for p in $MISS; do
			opkg install "$p" >/dev/null 2>&1 || \
				echo "install.sh: ВНИМАНИЕ: $p не установился (вероятно, kmod не под ядро прошивки) — продолжаю"
		done
	else
		apk update 2>&1 | tail -1 || true
		for p in $MISS; do
			apk add "$p" >/dev/null 2>&1 || \
				echo "install.sh: ВНИМАНИЕ: $p не установился (вероятно, kmod не под ядро прошивки) — продолжаю"
		done
	fi
else
	echo "==> Все зависимости уже на месте"
fi

# --- установка ---
if [ "$PM" = opkg ]; then
	echo "==> Установка через opkg"
	if ! opkg install "$SRC"; then
		echo "install.sh: opkg завершился с ошибкой, пробую --force-depends (зависимости могли не совпасть по именам)…"
		opkg install --force-depends "$SRC" || fail "установка через opkg не удалась"
	fi
else
	echo "==> Установка через apk (OpenWrt 25+)"
	# локальные пакеты без подписи репозитория — нужен --allow-untrusted;
	# с подписанным пакетом (ключ в /etc/apk/keys/) флаг не обязателен
	apk add --allow-untrusted "$SRC" || fail "установка через apk не удалась"
fi

# --- пост-установочная проверка ---
if ubus list morok >/dev/null 2>&1; then
	echo "==> ubus-объект 'morok' зарегистрирован ✓"
else
	echo "install.sh: ВНИМАНИЕ: ubus-объект 'morok' не виден — попробуй: /etc/init.d/rpcd reload"
fi

echo "==> Готово. LuCI → Services → Морок (Ctrl+Shift+R для сброса кэша браузера)."
echo "    Удаление: sh uninstall.sh   (полный снос с конфигом: sh uninstall.sh --purge)"
