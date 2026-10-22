# Установка на ванильный OpenWrt

Поддерживаются OpenWrt **23.05**, **24.10** (opkg, пакет `.ipk`) и
**25.x** (apk v3, пакет `.apk`).

## Установка одной командой

```sh
curl -fsSL https://cdn.jsdelivr.net/gh/akurach/morok@main/build/install.sh | sh
```

install.sh определит пакетный менеджер автоматически:

- `opkg` (23.05/24.10) → ставит `.ipk`;
- `apk` (25.x) → ставит `.apk` с `--allow-untrusted` (пакет без подписи
  репозитория; подпись появится позже).

Зависимости (`curl ca-bundle kmod-nfnetlink-queue kmod-nft-queue
kmod-nft-tproxy`) ставятся из официальных фидов автоматически.

## Офлайн-вариант

Со [страницы релизов](https://github.com/akurach/morok/releases) скачай
пакет под свой менеджер, затем:

```sh
# opkg (23.05 / 24.10)
opkg install /tmp/luci-app-morok_0.2.0-1_aarch64_cortex-a53.ipk

# apk (25.x)
apk add --allow-untrusted /tmp/luci-app-morok_0.2.0-r1_aarch64_cortex-a53.apk
```

## Матрица совместимости

| Прошивка | PM | Пакет | Статус |
|---|---|---|---|
| GL.iNet Flint 2 (4.x, база 24.10) | opkg | ipk | ✅ боевая |
| Ваниль 24.10 | opkg | ipk | ✅ install/remove/conffiles проверены в контейнере |
| Ваниль 23.05 | opkg | ipk | ✅ формат и зависимости проверены; kmod'ы строго под ядро 5.15 — install.sh ставит из фидов |
| Ваниль 25.12-SNAPSHOT | apk | apk | ✅ install/del/conffiles проверены в контейнере |
| Ваниль 25.x | apk | **только apk** (ipk не поддерживается) | ✅ |

fw4/nft везде (23.05+ уже fw4) — `morok.nft`, policy routing переносимы
без изменений; iptables/fw3 в коде не используются.

## Особенности ванили

- **Архитектура**: сборка — `aarch64_cortex-a53` (Filogic 830: Flint 2,
  Xiaomi AX3000T и др.). Для других архитектур пакет собирается из
  исходников: `./build/build.sh <arch> --apk` (нужны бинари под arch в
  `luci-app-morok/binaries/<arch>/` — пока вендорим только aarch64).
- **HWID подписок**: берётся по MAC `eth0`. На DSA-ванили eth0 может не
  быть — тогда в настройках подписки выключи HWID (`hwid=0`) или используй
  UA без привязки. (Фоллбэк-цепочка интерфейсов — в планах.)
- **23.05**: проверен контейнерно; живая проверка — при первом
  пользователе на 23.05 (пишите в Issues).
- **AmneziaWG-ноды** требуют `kmod-amneziawg` + `amneziawg-tools` из фидов
  (есть в 24.10+).

## Требования к железу

- Флеш: ~64 МБ свободно (sing-box ~40 МБ в упаковке, xray, nfqws2).
- RAM: минимум 256 МБ, комфортно 512 МБ (sing-box держит rule-sets в
  памяти).
- USB-extroot не нужен, но при 128 МБ флеша — желателен.

## Удаление

```sh
opkg remove luci-app-morok        # ≤ 24.x
apk del luci-app-morok            # 25.x
# конфиг при удалении сохраняется; полный снос: MOROK_PURGE=1 opkg remove ...
```
