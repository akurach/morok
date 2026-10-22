# Flint 2 / OpenWrt: проверенные рамки для мокапа

**Срез на 20 октября 2026.** Это исследование платформы, а не диагностика конкретного роутера: установленная у пользователя прошивка, набор пакетов, свободное место и фактическая пропускная способность неизвестны.

## Что подтверждено

* Последний стабильный релиз официального OpenWrt на дату среза — **25.12.6**, опубликован **18 октября 2026**. Официальный релиз рекомендует обновление: в нём исправлены удалённо вызываемые уязвимости в штатных сетевых службах. [release 25.12.6](https://github.com/openwrt/openwrt/releases/tag/v25.12.6)
* Образ для Flint 2 действительно есть: target `mediatek/filogic`, профиль `glinet_gl-mt6000`, совместимое имя устройства `glinet,gl-mt6000`. Опубликованы `squashfs-sysupgrade.bin` и `squashfs-factory.bin`; selector/manifest указывает sysupgrade-образ размером 10 598 720 B и его SHA-256. [официальный manifest](https://downloads.openwrt.org/releases/25.12.6/targets/mediatek/filogic/profiles.json) · [каталог образов](https://downloads.openwrt.org/releases/25.12.6/targets/mediatek/filogic/)
* Аппаратная база: MediaTek Filogic 830 / MT7986AV, четыре Cortex-A53 по 2,0 ГГц, 1 GB DDR4, 8 GB eMMC; два 2.5GbE (один WAN, один WAN/LAN), четыре 1GbE LAN, USB 3.0, двухдиапазонный Wi‑Fi 6 4×4. [официальная страница устройства OpenWrt](https://openwrt.org/toh/gl.inet/gl-mt6000) · [спецификация GL.iNet](https://www.gl-inet.com/products/gl-mt6000)

## Stock GL.iNet и официальный OpenWrt — разные продукты

Flint 2 поставляется с модифицированным GL.iNet-форком OpenWrt и его web Admin Panel; в нём документированы готовые OpenVPN/WireGuard-клиент и сервер, Tor, VPN policy, Multi-WAN/failover/load balance, AdGuard Home, Tailscale и ZeroTier. Там же есть вход в LuCI как «Advanced Settings» и управление пакетами в «Plug-ins». [руководство Flint 2](https://docs.gl-inet.com/router/en/4/user_guide/gl-mt6000/) · [Plug-ins](https://docs.gl-inet.com/router/en/4/interface_guide/plugins/)

Официальный OpenWrt даёт LuCI/UBUS/UCI и свой набор образа/фидов, а не GL.iNet-панель и не её UX. Для первоначального перехода с OEM официальная страница устройства предписывает **sysupgrade**, а не factory image; конфигурацию не сохранять. Это важная граница интерфейса: мокап не должен показывать «безопасное обновление» без определения текущей прошивки и совместимого файла. [инструкция по устройству](https://openwrt.org/toh/gl.inet/gl-mt6000)

## Что изменилось после 24.10 и почему это важно UI

| Факт | Следствие для интерфейса |
|---|---|
| В 25.12 пакетный менеджер сменился с `opkg` на **`apk`**; старый OpenWrt-fork `opkg` больше не поддерживается. [notes 25.12.0](https://openwrt.org/releases/25.12/notes-25.12.0) | Сначала показывать «обнаруженный backend: stock GL.iNet / official 24.10 / official 25.12+». Команды и карточки установки нельзя делать универсальными. |
| Официальная памятка прямо запрещает `apk upgrade`: он может сломать систему из-за неполных зависимостей/конфликтов; безопасный путь — ASU, `owut` или Firmware Selector. [apk cheat sheet](https://openwrt.org/docs/guide-user/additional-software/opkg-to-apk-cheatsheet) | Нужен отдельный flow обновления образа с бэкапом и проверкой, а не кнопка «обновить всё». |
| В 25.12 по умолчанию включён LuCI Attended Sysupgrade, а на устройствах с достаточной flash — `owut`; ядро серии 25.12.0 было 6.12.71, в 25.12.6 обновлено до 6.12.112. [notes 25.12.0](https://openwrt.org/releases/25.12/notes-25.12.0) · [25.12.6](https://github.com/openwrt/openwrt/releases/tag/v25.12.6) | Обновление и установка kmod/драйверов требуют соответствия именно релизу, target и kernel ABI. В UI до применения нужны version, target, ABI и источник пакета; не обещать, что `.ipk` от GL.iNet или иной версии установится в 25.12 APK. |

У 25.12.6 есть относящееся к MT6000 исправление system timer; это ещё один аргумент показывать версию firmware и статус «есть обновление», но не делать вывод, что оно уже установлено. [release notes](https://github.com/openwrt/openwrt/releases/tag/v25.12.6)

## Реалистичная матрица для первого UX

Ниже — **проектная** матрица: наличие upstream/OpenWrt-исходников означает, что семейство технически может стать сервисом на этой архитектуре; интеграция в firewall/policy routing, корректная установка и производительность на Flint 2 не тестировались.

| Семейство | Статус для мокапа | Практическая оговорка |
|---|---|---|
| WireGuard | «Нативно поддерживается» | В official OpenWrt есть `wireguard-tools` + `kmod-wireguard`; stock-панель GL.iNet документирует клиент/сервер. Показывать как наиболее предсказуемый VPN-путь. [OpenWrt package](https://github.com/openwrt/openwrt/blob/main/package/network/utils/wireguard-tools/Makefile) |
| OpenVPN | «Поддерживается» | Stock GL.iNet документирует клиент/сервер. В 25.12.6 упоминается OpenVPN 2.7.7 как обновлённый optional package. Не выдавать скорость за измерение. [GL.iNet guide](https://docs.gl-inet.com/router/en/4/user_guide/gl-mt6000/) · [release](https://github.com/openwrt/openwrt/releases/tag/v25.12.6) |
| Xray | «Требует установки и policy-интеграции» | Официальный feed содержит рецепт `xray-core` с init/UCI-конфигурацией; готовый домашний UI, маршрутизация и kill switch из этого не следуют. [package recipe](https://github.com/openwrt/packages/blob/master/net/xray-core/Makefile) |
| sing-box | «Требует установки и policy-интеграции» | Официальный рецепт заявляет несколько семейств прокси/VPN и требует, в частности, `kmod-tun`; конкретные функции зависят от варианта сборки. [package recipe](https://github.com/openwrt/packages/blob/master/net/sing-box/Makefile) |
| AmneziaWG 3.1 | «Нужен совместимый пакет» | Официальная инструкция Amnezia описывает AWG 3.1 и пакеты для OpenWrt 24.10.8 и 25.12.5. Для 25.12.6 совместимость пакета следует отдельно проверить: kernel-модуль должен совпадать с ABI установленного ядра. [инструкция Amnezia](https://docs.amnezia.org/documentation/instructions/openwrt-os-awg/) |
| zapret2 | «Пользовательский сервис обработки пакетов, не VPN» | Upstream позиционирует проект как DPI-обработку; это не подтверждает готовый пакет/интеграцию для конкретного образа. В UI нужны отдельные состояния «сервис», «стратегия», «проверка доступа», а не карточка VPN. [upstream zapret2](https://github.com/bol-van/zapret2) |

## Скорость и решения для макета

GL.iNet заявляет **до 900 Mbit/s WireGuard** и **до 880 Mbit/s OpenVPN с DCO**, по Ethernet и в client mode; производитель сам оговаривает зависимость от конфигурации и меньшую скорость server mode. Это рекламные верхние оценки, **не независимый замер**, не показатель Xray/sing-box/оптимизации доставки и не гарантия для конкретной сети. [спецификация GL.iNet](https://www.gl-inet.com/products/gl-mt6000)

Для стильного, но честного домашнего менеджера достаточно трёх уровней: (1) крупный текущий статус «сеть работает / маршруты доступны», (2) понятные карточки маршрута с протоколом, устройствами, DNS, kill switch и последней проверкой, (3) Advanced-панель с firmware/package/backend/ABI, логами и экспортом диагностики. Прямой маршрут или маршрут через оптимизацию доставки сам по себе не означает VPN-защиту: состояние защиты показывать только на карточке конкретного VPN-туннеля и после его проверки. Нужны явные состояния: «не установлен», «настраивается», «подключён», «частично работает» (туннель поднят, проверка не пройдена), «ошибка», «нужен откат/восстановление». Скорость показывать только как результат фактического теста с датой и условиями, иначе — «не измерено».
