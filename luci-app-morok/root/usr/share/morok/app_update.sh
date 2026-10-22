#!/bin/sh
# app_update.sh — самообновление приложения luci-app-morok из нашего канала.
#
# Режимы:
#   app_update.sh --check     только проверка: скачивает манифест канала,
#                             сравнивает версии, печатает ОДНУ строку JSON:
#                             {ok, current, latest, notes, update_available,
#                              channel, error?}. Ничего больше не качает
#                             и не меняет.
#   app_update.sh update      полный цикл (см. ниже), лог на stdout.
#   app_update.sh update --force   переустановка, даже если версия та же
#                             (opkg: --force-reinstall) — для теста/ремонта.
#   app_update.sh --current   просто текущая установленная версия пакета.
#
# Канал: UCI morok.globals.app_channel, пусто/отсутствует — канал по
# умолчанию (jsdelivr-зеркало git-репозитория). Манифест канала:
#   {"version":"0.3.0",
#    "ipk":{"url":"https://…/luci-app-morok_0.3.0-1_aarch64_cortex-a53.ipk",
#           "sha256":"…"},
#    "apk":{"url":"https://…/luci-app-morok_0.3.0-r1_aarch64_cortex-a53.apk",
#           "sha256":"…"},
#    "notes":"что нового", "min_openwrt":"23.05"}
# Секции ipk/apk поддерживают и per-arch вариант (подход манифеста v2 для
# бинарей, W3_NOTES_D): {"arch":{"<DISTRIB_ARCH>":{"url","sha256"}}} —
# плоские url/sha256 тогда служат фоллбэком.
#
# Менеджер пакетов детектируется: opkg → секция ipk, apk (OpenWrt 25+) → apk.
#
# Полный цикл update:
#   манифест → semver-сравнение → min_openwrt → скачивание пакета в tmpfs
#   (напрямую, фоллбэк через туннель 127.0.0.1:7890) → проверка sha256 →
#   pre-backup /etc/config/morok → /etc/config/morok.pre-update → установка
#   (opkg install / apk add --allow-untrusted) → ожидание сервиса до 30с
#   (pidof по выбранному engine) → отчёт.
#
# Честно про откат: атомарно откатить пакетный апгрейд нереалистично
# (postinst уже перезаписал файлы и перезапустил сервис). Вместо отката:
#   * конфиг бэкапится ДО установки (/etc/config/morok.pre-update);
#   * /etc/config/morok — conffile пакета (и opkg, и apk его сохраняют при
#     upgrade — проверено в W3), postrm сгардирован по уроку 14 и при
#     upgrade не сносит /var/etc/morok;
#   * при провале установки/старта — внятная ошибка + указание на бэкап.
# Переустановка прежней версии вручную: opkg install --force-reinstall
# <старый.ipk> (пакет прошлой версии — из релиза канала).
#
# Для автономного теста: MOROK_CONF / MOROK_CHANNEL / MOROK_ARCH.

CONF="${MOROK_CONF:-morok}"
PKG=luci-app-morok
PROXY=http://127.0.0.1:7890
LOG=/tmp/log/morok.log
DEFAULT_CHANNEL='https://cdn.jsdelivr.net/gh/akurach/morok@main/channel/app.json'

log() { mkdir -p /tmp/log 2>/dev/null; echo "$(date '+%H:%M:%S') app_update: $*" >>$LOG 2>/dev/null; logger -t morok-appupdate "$*" 2>/dev/null; }
fail() { echo "ERROR: $*"; log "ERROR: $*"; exit 1; }

MODE=update
FORCE=0
for a in "$@"; do
	case "$a" in
		--check)   MODE=check ;;
		--current) MODE=current ;;
		--force)   FORCE=1 ;;
		update)    : ;;
		*) fail "неизвестный аргумент: $a (есть: update | --check | --current | --force)" ;;
	esac
done

# --- менеджер пакетов → формат пакета (секция манифеста: ipk|apk) ---
if command -v opkg >/dev/null 2>&1; then
	PM=opkg; FMT=ipk
elif command -v apk >/dev/null 2>&1; then
	PM=apk; FMT=apk
else
	fail "ни opkg, ни apk не найдены — платформа не поддерживается"
fi

current_version() {
	local v=''
	if [ "$PM" = opkg ]; then
		v=$(opkg list-installed "$PKG" 2>/dev/null | sed -n "s/^$PKG - //p" | head -1)
	else
		# apk info -v: "luci-app-morok-0.2.0-r1"
		v=$(apk info -v "$PKG" 2>/dev/null | sed -n "s/^$PKG-//p" | awk '{print $1}' | head -1)
	fi
	# релизный суффикс (-1 у opkg, -r1 у apk) в semver-сравнении не участвует
	echo "${v%%-*}"
}

[ "$MODE" = current ] && { current_version; exit 0; }

# --- канал ---
CHANNEL="${MOROK_CHANNEL:-}"
[ -z "$CHANNEL" ] && CHANNEL=$(uci -q get $CONF.globals.app_channel)
[ -z "$CHANNEL" ] && CHANNEL="$DEFAULT_CHANNEL"
case "$CHANNEL" in
	http://*|https://*) ;;
	*) fail "app_channel не http(s)-URL: $CHANNEL" ;;
esac

# --- архитектура (для per-arch секций манифеста) ---
ARCH="${MOROK_ARCH:-}"
if [ -z "$ARCH" ] && [ -f /etc/openwrt_release ]; then
	ARCH="$(sed -n "s/^DISTRIB_ARCH='\(.*\)'/\1/p" /etc/openwrt_release)"
fi

# a новее b? semver по числовым компонентам; отсутствующие компоненты = 0
ver_newer() {
	local a="$1" b="$2" i=1 x y
	[ -z "$a" ] && return 1
	[ -z "$b" ] && return 0
	[ "$a" = "$b" ] && return 1
	while [ $i -le 8 ]; do
		x=$(echo "$a" | cut -d. -f$i); [ "$i" -gt 1 ] && [ "$x" = "$a" ] && x=0
		y=$(echo "$b" | cut -d. -f$i); [ "$i" -gt 1 ] && [ "$y" = "$b" ] && y=0
		case "$x" in ''|*[!0-9]*) x=0 ;; esac
		case "$y" in ''|*[!0-9]*) y=0 ;; esac
		[ "$x" -gt "$y" ] && return 0
		[ "$x" -lt "$y" ] && return 1
		i=$((i+1))
	done
	return 1
}

tmp=$(mktemp -d) || fail "mktemp не отработал"
trap 'rm -rf "$tmp"' EXIT

fetch() { # url out — напрямую, при неудаче через локальный туннель
	curl -sL -m 120 -o "$2" "$1" 2>/dev/null && [ -s "$2" ] && return 0
	curl -sL -m 120 -x "$PROXY" -o "$2" "$1" 2>/dev/null && [ -s "$2" ]
}

# разбор манифеста одним ucode-прогоном → файлы $tmp/m.* (так не боремся
# с экранированием произвольного текста notes в shell)
parse_manifest() { # file pm arch
	ucode -e "
		import * as fs from 'fs';
		function w(name, v) {
			let f = fs.open('$tmp/' + name, 'w');
			if (f) { f.write('' + v); f.close(); }
		}
		let m = null;
		try { m = json(fs.readfile('$1')); } catch (e) { m = null; }
		if (type(m) != 'object') {
			w('m.error', 'манифест канала не JSON-объект'); exit(0);
		}
		if (m.version == null ||
		    match('' + m.version, /^[0-9]+\.[0-9]+(\.[0-9]+)?$/) == null) {
			w('m.error', 'манифест без корректного поля version'); exit(0);
		}
		w('m.version', m.version);
		w('m.notes', m.notes || '');
		w('m.min_openwrt', m.min_openwrt || '');
		let sec = (type(m['$2']) == 'object') ? m['$2'] : {};
		let url = '', sum = '';
		if (type(sec.arch) == 'object' && '$3' != '' &&
		    type(sec.arch['$3']) == 'object') {
			url = sec.arch['$3'].url || '';
			sum = sec.arch['$3'].sha256 || '';
		}
		if (url == '' && sec.url) url = sec.url;
		if (sum == '' && sec.sha256) sum = sec.sha256;
		w('m.url', url);
		w('m.sha256', sum);
		if (url == '' || sum == '') {
			if (type(sec.arch) == 'object')
				w('m.perr', 'в манифесте нет раздела $2 для архитектуры ${3:-?}');
			else
				w('m.perr', 'в манифесте нет секции $2 (url/sha256) — пакет для этого менеджера ($PM) канал не публикует');
		}
	"
}

mval() { # key — значение из $tmp/m.<key>, '' если нет
	[ -f "$tmp/m.$1" ] && cat "$tmp/m.$1"
}

# --- манифест ---
fetch "$CHANNEL" "$tmp/manifest.json" || fail "манифест канала недоступен: $CHANNEL"
parse_manifest "$tmp/manifest.json" "$FMT" "$ARCH"
[ -f "$tmp/m.error" ] && fail "$(cat "$tmp/m.error")"

latest=$(mval version)
cur=$(current_version)
echo -n "$cur" > "$tmp/m.current"

# --- режим --check: JSON и выход ---
if [ "$MODE" = check ]; then
	upd=0
	ver_newer "$latest" "$cur" && upd=1
	ucode -e "
		import * as fs from 'fs';
		function r(name) {
			let s = fs.readfile('$tmp/' + name);
			return s == null ? '' : s;
		}
		printf('%J\n', {
			ok: true,
			current: r('m.current'),
			latest: r('m.version'),
			update_available: $upd == 1,
			notes: r('m.notes'),
			channel: '$CHANNEL'
		});
	"
	exit 0
fi

# --- полный цикл ---
if [ "$FORCE" != 1 ] && ! ver_newer "$latest" "$cur"; then
	echo "OK: $PKG $cur актуален (в канале $latest) — обновление не требуется"
	exit 0
fi

# min_openwrt (мягко: SNAPSHOT/нечисловой релиз не блокируем)
minow=$(mval min_openwrt)
if [ -n "$minow" ] && [ -f /etc/openwrt_release ]; then
	rel=$(sed -n "s/^DISTRIB_RELEASE='\(.*\)'/\1/p" /etc/openwrt_release)
	case "$rel" in
		''|*SNAPSHOT*) : ;;
		*) ver_newer "$minow" "$rel" && \
			fail "манифест требует OpenWrt >= $minow, на роутере $rel" ;;
	esac
fi

[ -f "$tmp/m.perr" ] && fail "$(cat "$tmp/m.perr")"
url=$(mval url); sum=$(mval sha256)
case "$sum" in *[!0-9a-fA-F]*) fail "sha256 в манифесте не hex" ;; esac
[ ${#sum} -eq 64 ] || fail "sha256 в манифесте не 64 символа"

log "канал $CHANNEL → версия $latest ($PM), скачиваю $url"
echo "Скачиваю $PKG $latest ($PM)…"

fetch "$url" "$tmp/pkg.$FMT" || fail "скачивание не удалось: $url"
size=$(wc -c < "$tmp/pkg.$FMT" 2>/dev/null || echo 0)
[ "$size" -gt 100000 ] || fail "скачанный файл подозрительно мал ($size байт) — не пакет"
got=$(sha256sum "$tmp/pkg.$FMT" | cut -d' ' -f1)
[ "$got" = "$sum" ] || fail "sha256 не сошёлся: ожидали $sum, получили $got"
echo "sha256 сошёлся."

# pre-backup конфига (атомарного отката пакета нет — это наша страховка;
# /etc/config/morok к тому же conffile и переживает upgrade сам по себе)
[ -f /etc/config/morok ] && cp -p /etc/config/morok /etc/config/morok.pre-update

echo "Устанавливаю пакет…"
if [ "$PM" = opkg ]; then
	if [ "$FORCE" = 1 ]; then
		out=$(opkg install --force-reinstall "$tmp/pkg.$FMT" 2>&1); rc=$?
	else
		out=$(opkg install "$tmp/pkg.$FMT" 2>&1); rc=$?
	fi
else
	out=$(apk add --allow-untrusted "$tmp/pkg.$FMT" 2>&1); rc=$?
fi
[ -n "$out" ] && echo "$out" | tail -6
[ "$rc" -eq 0 ] || fail "$PM завершился с кодом $rc — пакет НЕ установлен; конфиг на месте (бэкап: /etc/config/morok.pre-update)"

# паранойя: conffiles должны были сохранить конфиг, но если его вдруг нет —
# возвращаем из бэкапа до старта сервиса
if [ ! -s /etc/config/morok ] && [ -f /etc/config/morok.pre-update ]; then
	cp -p /etc/config/morok.pre-update /etc/config/morok
	log "конфиг после установки отсутствовал — восстановлен из pre-update бэкапа"
fi

# сервис стартует из postinst (если enabled=1); ждём до 30с
engine=$(uci -q get $CONF.globals.engine); engine=${engine:-sing-box}
enabled=$(uci -q get $CONF.globals.enabled)
wait_service() {
	local i=0
	while [ $i -lt 30 ]; do
		case "$engine" in
			xray) pidof xray >/dev/null 2>&1 && return 0 ;;
			*)    pidof sing-box >/dev/null 2>&1 && return 0 ;;
		esac
		sleep 1; i=$((i+1))
	done
	return 1
}

if [ "$enabled" = 1 ]; then
	if wait_service; then
		echo "OK: $PKG обновлён до $(current_version), сервис $engine жив"
		log "обновление до $latest завершено успешно"
	else
		fail "пакет установлен, но сервис $engine не поднялся за 30с — смотрите logread и /tmp/log/morok.log; конфиг в норме (бэкап: /etc/config/morok.pre-update), поможет /etc/init.d/morok restart или переустановка прежней версии из релиза"
	fi
else
	echo "OK: $PKG обновлён до $(current_version) (сервис выключен, globals.enabled=0)"
	log "обновление до $latest завершено (сервис выключен)"
fi
exit 0
