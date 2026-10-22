# Установка на GL.iNet Flint 2 (GL-MT6000)

Первичная платформа Морока. Прошивка GL 4.x (база OpenWrt 24.10, opkg).

## Требования

- Flint 2 с прошивкой GL 4.x (проверено на 4.7+);
- ~64 МБ свободной флеш-памяти (`df -h /overlay`);
- SSH-доступ root@192.168.8.1 (или свой адрес роутера).

## Установка одной командой

```sh
ssh root@192.168.8.1
curl -fsSL https://cdn.jsdelivr.net/gh/akurach/morok@main/build/install.sh | sh
```

Скрипт сам: определит opkg → скачает свежий `.ipk` из канала (jsdelivr,
работает из РФ) → проверит sha256 → поставит зависимости
(`curl ca-bundle kmod-nft-tproxy` и др.) → установит пакет → запустит сервис.

После установки: **LuCI → Services → Морок**. Обязательно обнови страницу
через **Ctrl+Shift+R** — LuCI злостно кэширует JS/CSS.

## Офлайн-вариант (GitHub недоступен)

1. Скачай на компьютере `luci-app-morok_*_aarch64_cortex-a53.ipk` со
   [страницы релизов](https://github.com/akurach/morok/releases).
2. Залей и поставь:

```sh
scp luci-app-morok_*_aarch64_cortex-a53.ipk root@192.168.8.1:/tmp/
ssh root@192.168.8.1 'opkg install /tmp/luci-app-morok_*.ipk'
```

## Первичная настройка

1. Открой **Services → Морок**.
2. Добавь подписку (ссылка на подписку провайдера нод) или отдельные ноды
   (vless/vmess/trojan/ss/hy2/tuic, AmneziaWG).
3. Выбери режим: **smart** (по правилам) или **global** (всё в туннель).
4. Включи сервис тумблером на дашборде.
5. Проверка: с клиентского устройства открой 2ip.ru — должен показать IP ноды
   (для проксируемых правилом ресурсов).

## Особенности GL-прошивки

- HWID для панелей подписок считается по MAC `eth0` — на Flint 2 он есть,
  схема совместима с passwall2.
- kmod-пакеты из ванильных фидов могут не совпасть с ядром GL — install.sh
  ставит их в режиме best effort; недостающее доустановится по Depends
  либо уже есть в прошивке GL (nfnetlink-queue/nft-queue/tproxy в 4.x есть).
- Обновление пакета сохраняет `/etc/config/morok` и скачанные списки.

## Удаление

```sh
opkg remove luci-app-morok                    # конфиг сохраняется
MOROK_PURGE=1 opkg remove luci-app-morok      # полный снос с конфигом
```
