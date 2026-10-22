# Архитектура Морока

Кратко по устройству пакета.

## Общая схема

```
┌─ LuCI UI (JS, /www/luci-static/resources/view/morok/*.js + morok/common.js)
│     └─ общается с роутером ТОЛЬКО через ubus-объект `morok` (ACL-ограниченно)
├─ rpcd backend (/usr/libexec/rpcd/morok, ucode; метрики — morok_metrics)
│     └─ читает/пишет UCI /etc/config/morok — единственный источник правды
├─ gen_config.uc → /var/etc/morok/sing-box.json (tmpfs, флеш не жжём)
│     xray_gen.uc → конфиг xray, при engine=xray
├─ sing-box: tproxy :7895 (TCP+UDP), mixed :7890 (локальный), Clash API :9090
│     └─ бинарь вендорится в пакете: /usr/lib/morok/bin/
├─ xray (альтернативный движок, xhttp-транспорт) — тоже вендорный
├─ nftables: таблица inet morok (tproxy + kill switch + per-device + DNS-hijack)
├─ subscribe.sh (подписки) + parse_nodes.uc (парсер ссылок) — cron
├─ ruleset_update.sh (списки доменов/geosite) — cron
├─ guardian.sh — сторож: адаптивные правила оптимизации (probe → proxy → rescan)
├─ движок оптимизации доставки: zapret2/nfqws2 — бинарь вендорится
└─ bin_update.sh — обновление вендорных бинарей из канала (GitHub → jsdelivr-манифесты)
```

## Ключевые принципы

- **UCI — источник правды.** UI ничего не хранит; gen_config пересобирает
  рантайм-конфиг из UCI с жёсткой валидацией (битая ссылка на ноду —
  предупреждение, а не crash-loop).
- **Состояние в tmpfs.** `/var/etc/morok/` — runtime (конфиги движков,
  списки, кэши); во флеше — только `/etc/config/morok`.
- **Вендорные бинари.** sing-box, xray, nfqws2 едут внутри ipk/apk и
  обновляются из нашего канала (per-arch манифест v2, sha256, атомарная
  подмена с откатом). Никаких внешних фидов для критичного.
- **Всё видно.** Метрики (nft-счётчики + Clash API, ring-buffer 24 ч),
  журнал решений, диагностика по шагам — в UI.

## Потоки трафика (режим smart)

1. DNS клиентов хиджачится первым правилом в prerouting (до
   `fib daddr type local`) — иначе провайдерский DNS может вернуть
   некорректные ответы для маршрутизируемых доменов.
2. Пакеты матчатся правилами UCI (geosite/geoip/кастом/списки) →
   proxy (tproxy в движок) / direct / block / antidpi (nfqws2).
3. Внутри движка — fallback-цепочка (urltest) выбирает живую ноду.
4. Per-device правила (по MAC) могут переопределить маршрут устройства.

## Компоненты пакета

| Путь | Назначение |
|---|---|
| `/etc/config/morok` | UCI-конфиг (globals, fallback, antidpi, node, subscription, rule, device, source, component) |
| `/usr/libexec/rpcd/morok` | ubus backend (ucode), ~25 методов |
| `/usr/share/morok/gen_config.uc` | генератор sing-box.json |
| `/usr/share/morok/xray_gen.uc` | генератор конфига xray |
| `/usr/share/morok/*.sh` | подписки, списки, guardian, оптимизация доставки, обновления |
| `/usr/lib/morok/bin/` | вендорные бинари |
| `/www/luci-static/resources/` | UI (view/morok/*.js, morok/common.js, morok.css) |

## Канал обновлений

См. [channel/README.md](../channel/README.md): манифесты через jsdelivr,
бинари и пакеты — GitHub release-ассеты с sha256.
