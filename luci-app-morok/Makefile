include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-morok
PKG_VERSION:=0.2.0
PKG_RELEASE:=1

LUCI_TITLE:=Морок — продвинутая маршрутизация и оптимизация трафика
LUCI_DESCRIPTION:=Современный LuCI-интерфейс для прозрачного прокси на sing-box: пул нод, правила маршрутизации, фоллбэк-цепочки, kill switch, оптимизация доставки пакетов.
# sing-box и nfqws2 НЕ зависимости — вендорятся в пакете (binaries/<arch>/ -> /usr/lib/morok/bin/)
LUCI_DEPENDS:=+luci-base +rpcd +ucode +curl +ca-bundle +firewall4 +kmod-nfnetlink-queue +kmod-nft-queue +kmod-nft-tproxy
# пакет несёт архитектурно-специфичные бинари — не 'all'
LUCI_PKGARCH:=aarch64_cortex-a53

PKG_LICENSE:=GPL-3.0
PKG_MAINTAINER:=Morok Project

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
