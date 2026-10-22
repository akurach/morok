#!/bin/sh
# bin_update.sh <name> [--check] — канал автообновления вендорных бинарей.
#
# Режимы:
#   bin_update.sh <name>           полный цикл обновления (см. ниже)
#   bin_update.sh <name> --check   только проверка: есть ли новая версия.
#                                  Ничего не качает кроме манифеста, ничего
#                                  не меняет. Выход: одна строка вида
#                                  "OK: <name>: 1.14.0 → 1.14.1 (доступно обновление)"
#                                  или "OK: <name>: 1.14.0 (актуально)".
#
# Контракт канала: component.channel_url отдаёт JSON-манифест.
# Формат v2 (per-arch, предпочтительно):
#   {"version":"1.2.3",
#    "arch":{"aarch64_cortex-a53":{"url":"https://.../sing-box","sha256":"..."},
#            "x86_64":{"url":"...","sha256":"..."}}}
# Формат v1 (legacy, плоский) — тоже принимается:
#   {"version":"1.2.3","url":"https://.../sing-box","sha256":"..."}
# Архитектура роутера — DISTRIB_ARCH из /etc/openwrt_release.
#
# Цикл обновления: манифест → скачивание → verify sha256 → смоук-тест
# (бинарь запускается) → бэкап в .prev → атомарная подмена (mv поверх,
# бинаря «нет» ни в один момент) → restart сервиса → откат из бэкапа
# при неудаче. Всё, что не сошлось — ERROR + ненулевой выход,
# ничего не подменяем.
#
# Скачивание: сначала напрямую, при неудаче — через локальный туннель
# (127.0.0.1:7890), как в ruleset_update.sh.
#
# Для автономного теста (не на роутере): MOROK_BIN_DIR, MOROK_CONF,
# MOROK_ARCH переопределяют layout; uci/ucode можно подменить заглушками
# через PATH (см. W3_NOTES_D.md).

CONF="${MOROK_CONF:-morok}"
BIN_DIR="${MOROK_BIN_DIR:-/usr/lib/morok/bin}"
PROXY=http://127.0.0.1:7890
LOG=/tmp/log/morok.log

log() { mkdir -p /tmp/log 2>/dev/null; echo "$(date '+%H:%M:%S') bin_update: $*" >>$LOG 2>/dev/null; logger -t morok-binupdate "$*" 2>/dev/null; }
fail() { echo "ERROR: $*"; log "ERROR: $*"; exit 1; }

name="$1"
mode="${2:-}"
[ -n "$name" ] || fail "usage: $0 <component-name> [--check]"
[ "$mode" = "--check" ] || [ -z "$mode" ] || fail "неизвестный режим: $mode (есть только --check)"
case "$name" in *[!A-Za-z0-9_.-]*) fail "недопустимое имя компонента" ;; esac

# архитектура для per-arch манифеста
ARCH="${MOROK_ARCH:-}"
if [ -z "$ARCH" ] && [ -f /etc/openwrt_release ]; then
	ARCH="$(sed -n "s/^DISTRIB_ARCH='\(.*\)'/\1/p" /etc/openwrt_release)"
fi

# секция component по option name или по имени секции (ucode — cfgXXXX,
# `uci show` на GL-прошивке для анонимных секций не парсим)
sid=$(ucode -e "
	import { cursor } from 'uci';
	let c = cursor(); c.load('$CONF');
	c.foreach('$CONF', 'component', function(s) {
		if ((s.name || s['.name']) == '$name') print(s['.name']);
	});
")
[ -n "$sid" ] || fail "компонент не найден: $name"

channel=$(uci -q get $CONF.$sid.channel_url)
[ -n "$channel" ] || fail "канал обновлений не настроен для $name (component.$sid.channel_url пуст)"

path=$(uci -q get $CONF.$sid.path); path=${path:-$BIN_DIR/$name}
case "$path" in
	$BIN_DIR/*) ;;
	*) fail "недопустимый path: $path (только $BIN_DIR/)" ;;
esac

tmp=$(mktemp -d) || fail "mktemp не отработал"
trap 'rm -rf "$tmp"' EXIT

fetch() { # url out
	curl -sL -m 120 -o "$2" "$1" 2>/dev/null && [ -s "$2" ] && return 0
	curl -sL -m 120 -x "$PROXY" -o "$2" "$1" 2>/dev/null && [ -s "$2" ]
}

# поле из манифеста с учётом per-arch: .arch[<arch>].<key> или плоское .<key>
mget() { # manifest key
	ucode -e "
		import * as fs from 'fs';
		let m = json(fs.readfile('$tmp/manifest.json'));
		if (!m) { print(''); }
		else {
			let v = '';
			let arch = '$ARCH';
			if (type(m.arch) == 'object' && arch != '' &&
			    type(m.arch[arch]) == 'object' && m.arch[arch]['$1'])
				v = m.arch[arch]['$1'];
			else if (m['$1'])
				v = m['$1'];
			print('' + (v || ''));
		}
	"
}

# --- манифест ---
fetch "$channel" "$tmp/manifest.json" || fail "манифест канала недоступен: $channel"
url=$(mget url)
sum=$(mget sha256)
ver=$(ucode -e "import * as fs from 'fs'; let m = json(fs.readfile('$tmp/manifest.json')); print((m && m.version) || '');" 2>/dev/null)
if [ -z "$url" ] || [ -z "$sum" ]; then
	# возможно, манифест v2, но без нашей архитектуры
	ucode -e "import * as fs from 'fs'; let m = json(fs.readfile('$tmp/manifest.json')); exit(type(m) == 'object' && type(m.arch) == 'object' ? 0 : 1);" 2>/dev/null && \
		fail "в манифесте канала нет раздела для архитектуры '${ARCH:-?}'"
	fail "манифест без url/sha256 — формат канала не наш"
fi
case "$sum" in *[!0-9a-fA-F]*) fail "sha256 в манифесте не hex" ;; esac
[ ${#sum} -eq 64 ] || fail "sha256 в манифесте не 64 символа"

# --- режим --check: только сравнить версии ---
if [ "$mode" = "--check" ]; then
	cur=$(uci -q get $CONF.$sid.version)
	# актуальная версия — из самого бинаря, UCI-version лишь кэш
	if [ -x "$path" ]; then
		v=$("$path" version 2>/dev/null | sed -n 's/^sing-box version //p')
		[ -z "$v" ] && v=$("$path" --version 2>/dev/null | sed -n 's/^sing-box version //p')
		[ -n "$v" ] && cur="$v"
	fi
	if [ -z "$ver" ]; then
		fail "манифест без version — нечего сравнивать"
	elif [ "$cur" = "$ver" ]; then
		echo "OK: $name: $cur (актуально)"
		exit 0
	elif [ -z "$cur" ]; then
		echo "OK: $name: версия неизвестна → $ver (доступно обновление)"
		exit 0
	else
		echo "OK: $name: $cur → $ver (доступно обновление)"
		exit 0
	fi
fi

log "$name: канал $channel → версия ${ver:-?}, скачиваю $url"

# --- скачивание + verify ---
fetch "$url" "$tmp/bin" || fail "скачивание не удалось: $url"
got=$(sha256sum "$tmp/bin" | cut -d' ' -f1)
[ "$got" = "$sum" ] || fail "sha256 не сошёлся: ожидали $sum, получили $got"
chmod 755 "$tmp/bin"
# бинарь должен хотя бы запускаться (смоук-тест)
"$tmp/bin" --version >/dev/null 2>&1 || "$tmp/bin" version >/dev/null 2>&1 || \
	fail "скачанный бинарь не запускается на этой платформе"

# --- атомарная подмена (в пределах одной fs: .new рядом, rename атомарен) ---
# текущий бинарь сохраняем в .prev/<name> — постоянная точка отката
# (rpcd-метод rollback); $tmp/rollback — страховка на время этого запуска
mkdir -p "$BIN_DIR/.prev"
[ -f "$path" ] && cp -p "$path" "$tmp/rollback"
[ -f "$path" ] && cp -p "$path" "$BIN_DIR/.prev/$name"
cp "$tmp/bin" "$path.new" || fail "не смог записать $path.new"
mv "$path.new" "$path" || { rm -f "$path.new"; fail "rename $path не удался"; }
uci set $CONF.$sid.version="$ver"
uci commit $CONF
log "$name: подменил $path на версию ${ver:-?}, перезапускаю сервис"

restart_ok() {
	case "$name" in
	sing-box)
		/etc/init.d/morok restart >/dev/null 2>&1
		pidof sing-box >/dev/null 2>&1
		;;
	nfqws2)
		/usr/share/morok/antidpi.sh restart >/dev/null 2>&1
		sleep 1
		# engine выключен/не нужен — нормально, что процесса нет
		pidof nfqws2 >/dev/null 2>&1 && return 0
		[ "$(uci -q get $CONF.antidpi.engine)" != "zapret2" ]
		;;
	*)
		return 0
		;;
	esac
}

if ! restart_ok; then
	log "$name: сервис не поднялся после обновления — ОТКАТ"
	[ -f "$tmp/rollback" ] && cp "$tmp/rollback" "$path"
	restart_ok >/dev/null 2>&1
	fail "сервис не поднялся после обновления — выполнен откат на прежний бинарь"
fi

echo "OK: $name обновлён до ${ver:-?}"
log "$name: обновление завершено успешно"
exit 0
