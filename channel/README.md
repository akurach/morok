# Канал обновлений Морок

Файлы этого каталога — манифесты стабильного канала. Генерируются
`scripts/make_channel.sh` (локально и в `.github/workflows/release.yml`),
вручную не редактировать.

## Файлы

| Файл | Потребитель | Назначение |
|---|---|---|
| `latest.env` | `build/install.sh` | плоские sh-переменные: версии, URL, sha256 пакетов |
| `app.json` | самообновление приложения (Wave 4.1), сайт | версия, ссылки на ipk/apk, sha256 |
| `binaries.json` | люди и tooling | агрегатный индекс компонентов |
| `bin/<comp>.json` | `bin_update.sh` на роутере | per-component манифест **v2 (per-arch)**: `{"version","arch":{"<arch>":{"url","sha256"}}}` |

## Раздача через jsdelivr

`raw.githubusercontent.com` не везде доступен стабильно, поэтому
манифесты читаются через jsdelivr-копию репозитория:

```
https://cdn.jsdelivr.net/gh/akurach/morok@main/channel/app.json
https://cdn.jsdelivr.net/gh/akurach/morok@main/channel/bin/sing-box.json
```

Это **канал по умолчанию**: URL манифестов зашиваются в UI (страница
«Компоненты» → `component.channel_url`) и в install.sh.

Особенности jsdelivr:
- кэш `@main` — до ~12 ч; после релиза кэш сбрасывается из CI
  (`purge.jsdelivr.net`), вручную: `https://purge.jsdelivr.net/gh/akurach/morok@main/channel/app.json`;
- лимит ~20 МБ на файл и **нет доступа к release-ассетам** — поэтому
  сами бинари (sing-box ~82 МБ, xray ~34 МБ) и пакеты лежат только в
  GitHub release-ассетах, а через jsdelivr идут лишь манифесты (килобайты).

## Скачивание бинарей/пакетов

URL в манифестах указывают на GitHub release-ассеты. Если из вашей сети
`github.com`/`objects.githubusercontent.com` недоступны:
- `bin_update.sh` и `ruleset_update.sh` при неудаче прямого скачивания
  автоматически повторяют через локальный туннель Морок (127.0.0.1:7890) —
  т.е. после первичной установки обновления ходят даже при недоступном
  GitHub;
- первичная установка при недоступном GitHub: скачайте пакет на другом
  устройстве и поставьте с локального файла
  (`sh install.sh /tmp/luci-app-morok_*.ipk`).
- открытый вопрос: полноценное зеркало release-ассетов на альтернативном
  CDN.
