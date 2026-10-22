# luci-app-morok

Современный LuCI-интерфейс для прозрачного прокси на OpenWrt: пул нод,
правила маршрутизации, фоллбэк-цепочки, kill switch и адаптивная
оптимизация доставки пакетов.
Целевое устройство разработки — GL.iNet Flint 2 (GL-MT6000, OpenWrt 24.10/25.12).

## Архитектура

```
┌─ LuCI JS (htdocs/.../view/morok/*.js + morok.css)   ← единственное, что видит пользователь
│        │ ubus (объект "morok")
├─ rpcd-бэкенд (root/usr/libexec/rpcd/morok, ucode)     ← читает/пишет UCI, читает Clash API
│        │
├─ /etc/config/morok (UCI)                              ← единственный источник правды
│        │
├─ gen_config.uc → /var/etc/morok/sing-box.json         ← генерация (tmpfs, флеш не жжём)
├─ init.d/morok + morok.nft                           ← tproxy-заворот, procd-запуск sing-box
├─ guardian.sh                                            ← адаптивные правила оптимизации
└─ subscribe.sh                                           ← подписки с бэкап-ссылками
```

Живые метрики (пинги, выбранная urltest-ом нода) читаются из Clash API
sing-box (`127.0.0.1:9090`) — фронт ничего не выдумывает.

## Поддерживаемые типы нод

vless (+Reality/XTLS Vision), trojan, hysteria2, tuic, shadowsocks (вкл. 2022),
wireguard. AmneziaWG — отдельным интерфейсом (обфускация AWG не входит в
sing-box), поддержка в роадмапе.

## Установка (dev, без сборки пакета)

Приложение целиком скриптовое — компилировать нечего:

```sh
# с машины разработки
cd luci-app-morok
tar czf - root htdocs | ssh root@192.168.8.1 'tar xzf - -C /'

# на роутере
ssh root@192.168.8.1
opkg update && opkg install sing-box curl ca-bundle   # OpenWrt ≤24.10 / сток GL
# или: apk add sing-box curl ca-bundle                # OpenWrt 25.12+
chmod +x /etc/init.d/morok /usr/libexec/rpcd/morok /usr/share/morok/*.sh
/etc/init.d/rpcd restart
/etc/init.d/morok enable && /etc/init.d/morok start
```

LuCI → Services → Morok.

## Сборка ipk/apk

Положить каталог в `feeds/luci/applications/luci-app-morok` (или свой feed),
далее стандартно: `make package/luci-app-morok/compile`.

## Что уже работает / роадмап

Боевой дебаг на GL-MT6000 (GL 4.8.3 / OpenWrt 24.10.4 / sing-box 1.14.0) — 20.10.2026.

- [x] Дашборд: живой статус, цепочка, kill switch баннер, быстрые тоглы
- [x] Пул нод: группы по подпискам, пинги из Clash API, вкл/выкл, выбор активной
- [x] Маршрутизация: тоглы правил, добавление custom-правила, источники списков
- [x] Фоллбэк: цепочка, порог переключения, автовозврат, режим kill switch
- [x] guardian.sh: адаптивная оптимизация (умерла → прокси, ожила → назад)
- [x] subscribe.sh: бэкап-ссылки, обновление через прокси при недоступности домена
- [x] parse_nodes.uc: sing-box JSON подписки → UCI-ноды (outbound verbatim)
- [x] Локальные .srs rule-sets (raw.githubusercontent не везде доступен,
      обновление через jsdelivr: ruleset_update.sh)
- [ ] Share-ссылки (vless:// и пр.) в парсере подписок и импорте
- [ ] Модалки добавления/редактирования ноды в UI
- [ ] Экран «Устройства» (per-device маршруты), Диагностика по этапам
- [ ] AmneziaWG-интерфейс, zapret2/byedpi автоустановка и профили стратегий
- [ ] Журнал решений (что изменилось и почему)

### Боевые заметки (GL-специфика)

- rpcd на GL 4.8.3 понимает только legacy exec-протокол (list/call),
  ucode-плагины не регистрируются
- sing-box 1.14: DNS только новый формат, geo* только через rule_set,
  block/dns-аутбоунды удалены (action: reject / hijack-dns)
- Фоновые демоны обязаны закрывать procd-lock fd (`1000>&-`), иначе
  init-скрипт виснет на flock
- `uci set ...="@node[N]"` пишет ссылку как строку — id нод резолвить в cfgXXXX
- TPROXY требует `ip rule fwmark 0x1 lookup 100` + local route в lo
