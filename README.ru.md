<!-- Сохраняйте идентичность разработчика, URL репозитория, команды, пути,
     номера версий и адреса кошельков в этом файле байт-в-байт идентичными
     переведённым файлам README. -->

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/branding/row-template-logo.png">
    <img src="docs/assets/branding/row-template-wordmark-en.png" alt="Row-Template" height="140">
  </picture>
</p>

<p align="center">
  Аккуратная автономная страница подписки для панелей <a href="https://github.com/MHSanaei/3x-ui">3X-UI</a>, <a href="https://github.com/PasarGuard/panel">PasarGuard</a> и <a href="https://github.com/rebeccapanel/Rebecca">Rebecca</a> — семнадцать дизайнов, каждый в одном HTML-файле, полностью white-label и без сторонних запросов со страницы, которую открывают ваши подписчики.
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.fa.md">فارسی</a> | <a href="README.ar.md">العربية</a> | <strong>Русский</strong> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/frank0live/Row-Template"></a>
  <a href="https://github.com/frank0live/Row-Template/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/frank0live/Row-Template?sort=semver"></a>
  <img alt="Panels" src="https://img.shields.io/badge/panels-3X--UI%20%7C%20PasarGuard%20%7C%20Rebecca-informational">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Linux-lightgrey">
  <a href="https://iitzseridev.github.io/Row-Template/"><img alt="Documentation" src="https://img.shields.io/badge/docs-GitHub%20Pages-blue"></a>
</p>

<p align="center">
  <a href="#установка">Установка</a> ·
  <a href="#дизайны">Дизайны</a> ·
  <a href="https://iitzseridev.github.io/Row-Template/">Документация</a> ·
  <a href="CHANGELOG.md">Изменения</a> ·
  <a href="https://github.com/frank0live/Row-Template/releases">Релизы</a>
</p>

---

## Что это такое

3X-UI, PasarGuard и Rebecca умеют показывать подписчикам собственную страницу вместо встроенной. Row-Template — такая страница: подписчик открывает ссылку на подписку и видит свой тариф, расход трафика, дату окончания и способы добавить подписку в своё приложение в одно касание.

Каждый дизайн поставляется одним автономным HTML-файлом, в который встроены все стили, скрипты, шрифты и генератор QR-кодов, а также версией на языке шаблонов каждой панели. Одна команда определяет вашу панель, устанавливает страницу рядом с ней, направляет на неё панель и даёт вам менеджер `row-template` для оформления, обновлений и отката.

## Почему Row-Template?

- **Приватность по умолчанию.** Страница, которую открывают подписчики, не делает сторонних запросов. QR-коды генерируются прямо на странице, а ваше оформление вставляется как текст — никогда не выполняется и никуда не отправляется.
- **Настоящий white-label.** Ваше название сервиса, ваша ссылка на поддержку, ваш логотип. Ничто на странице не указывает на Row-Template.
- **Семнадцать дизайнов, каждый в одном файле.** Выберите вид, который подходит вашему сервису. У всех дизайнов одинаковые возможности, языки и проверки безопасности — на каждой поддерживаемой панели.
- **Сделано для ваших подписчиков.** Расход и срок действия в реальном времени, импорт в популярные приложения в одно касание и список отдельных конфигураций с поиском, чтобы добавить один сервер вручную.
- **Безопасен в эксплуатации.** Релизы с проверкой контрольной суммы, транзакционная активация, которая точно восстанавливает панель при сбое любого шага, и откат одной командой. Row-Template никогда не патчит вашу панель: в 3X-UI он меняет одну настройку (`subThemeDir`), в PasarGuard добавляет один помеченный блок в `.env`, а в Rebecca задаёт два поля настроек подписки.

## Дизайны

Row-Template 1.3.0 поставляется с семнадцатью дизайнами. Дизайн по умолчанию — Row.

<table>
  <tr>
    <td align="center"><img src="docs/public/previews/row-mobile.webp" width="150" alt="Row"><br><sub>Row</sub></td>
    <td align="center"><img src="docs/public/previews/editorial-mobile.webp" width="150" alt="Editorial"><br><sub>Editorial</sub></td>
    <td align="center"><img src="docs/public/previews/canvas-mobile.webp" width="150" alt="Canvas"><br><sub>Canvas</sub></td>
    <td align="center"><img src="docs/public/previews/prism-mobile.webp" width="150" alt="Prism"><br><sub>Prism</sub></td>
    <td align="center"><img src="docs/public/previews/terminal-mobile.webp" width="150" alt="Terminal"><br><sub>Terminal</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/public/previews/pulse-mobile.webp" width="150" alt="Pulse"><br><sub>Pulse</sub></td>
    <td align="center"><img src="docs/public/previews/brutal-mobile.webp" width="150" alt="Brutal"><br><sub>Brutal</sub></td>
    <td align="center"><img src="docs/public/previews/arcade-mobile.webp" width="150" alt="Arcade"><br><sub>Arcade</sub></td>
    <td align="center"><img src="docs/public/previews/sketch-mobile.webp" width="150" alt="Sketch"><br><sub>Sketch</sub></td>
    <td align="center"><img src="docs/public/previews/signature-mobile.webp" width="150" alt="Signature"><br><sub>Signature</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/public/previews/saffron-mobile.webp" width="150" alt="Saffron"><br><sub>Saffron</sub></td>
    <td align="center"><img src="docs/public/previews/pulsenova-mobile.webp" width="150" alt="Pulse Nova"><br><sub>Pulse Nova</sub></td>
    <td align="center"><img src="docs/public/previews/prismnova-mobile.webp" width="150" alt="Prism Nova"><br><sub>Prism Nova</sub></td>
    <td align="center"><img src="docs/public/previews/terminalnova-mobile.webp" width="150" alt="Terminal Nova"><br><sub>Terminal Nova</sub></td>
    <td align="center"><img src="docs/public/previews/arcadenova-mobile.webp" width="150" alt="Arcade Nova"><br><sub>Arcade Nova</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/public/previews/meter-mobile.webp" width="150" alt="Meter"><br><sub>Meter</sub></td>
    <td align="center"><img src="docs/public/previews/notebook-mobile.webp" width="150" alt="Notebook"><br><sub>Notebook</sub></td>
  </tr>
</table>

<sub>Превью построены на демонстрационных данных самого проекта. Превью каждого дизайна для компьютера и телефона — в <a href="https://iitzseridev.github.io/Row-Template/templates/">галерее шаблонов</a>.</sub>

Выберите дизайн при новой интерактивной установке, задайте `RT_TEMPLATE` для установки скриптом или смените его позже в менеджере (**Reconfigure branding → Template**). Обновления сохраняют ваш выбор. Значения `RT_TEMPLATE`: `row`, `editorial`, `canvas`, `prism`, `terminal`, `pulse`, `brutal`, `arcade`, `sketch`, `signature`, `saffron`, `pulsenova`, `prismnova`, `terminalnova`, `arcadenova`, `meter` и `notebook`.

## Возможности

**Для ваших подписчиков**

- **Статус в реальном времени.** Состояние тарифа, израсходованный и оставшийся трафик и срок действия, которые обновляются из вашей панели, пока страница открыта на экране (в 3X-UI; в PasarGuard и Rebecca страница показывает значения на момент открытия).
- **Импорт в одно касание** в популярные приложения, сгруппированные по платформам: v2rayNG, Happ и sing-box на Android; Streisand, V2Box и Shadowrocket на iOS; Clash Verge Rev, Mihomo Party и v2rayN на Windows; Clash Verge Rev, Streisand и V2Box на macOS.
- **Копирование и QR.** Скопируйте ссылку на подписку или отсканируйте её как QR-код, созданный на самой странице.
- **Обозреватель конфигураций.** Каждый сервер в отдельной строке — с флагом страны или монограммой и меткой протокола (VLESS, VMess, Trojan, Shadowsocks, Hysteria/Hysteria2, WireGuard, AmneziaWG, Telegram MTProto), с QR-кодом и копированием для каждой конфигурации и поиском по длинным спискам.
- **Пять языков** — английский, персидский, арабский, русский и китайский — с раскладкой справа налево и выбором темы System / Light / Dark.

**Для вас**

- **White-label оформление.** Название сервиса, ссылка на поддержку и логотип — всё необязательно, хранится как данные и вставляется как текст.
- **Менеджер для всего.** Интерактивное меню и прямые команды для оформления, обновлений, проверки, отката и удаления.
- **Обновления из стабильного канала.** `row-template update` при каждом запуске устанавливает последний стабильный релиз с проверкой — поэтому это ещё и быстрый способ восстановить установку.

**Приватность и безопасность**

- **Никаких сторонних запросов** со страницы: без CDN, без внешних сервисов QR и геолокации, без телеметрии. Статус в реальном времени приходит из вашей же панели.
- **Обязательная проверка SHA-256** для каждой загрузки релиза, без возможности её пропустить.
- **Атомарная активация.** Новая страница создаётся и проверяется до того, как заменит работающую, поэтому неудачный шаг никогда не оставляет сломанную страницу.
- **Осторожное обнаружение панели.** Панель считается установленной, только когда совпадают независимые признаки; частично установленная панель или база данных панели, не являющаяся корректной базой SQLite, отвергается, а не угадывается.

## Поддерживаемые панели

| Панель | Статус | Примечания |
| ----- | ------ | ----- |
| [3X-UI](https://github.com/MHSanaei/3x-ui) (MHSanaei) | ✅ Поддерживается | Требуется версия **>= 3.6.0** |
| [PasarGuard](https://github.com/PasarGuard/panel) | ✅ Поддерживается с 1.3.0 | PasarGuard **5.x** — официальная установка в Docker или установка из исходников (`pasarguard.service`) |
| [Rebecca](https://github.com/rebeccapanel/Rebecca) | ✅ Поддерживается с 1.3.0 | Rebecca **1.x**, версия на Go (бинарная установка Rebecca). Автоматическая активация с SQLite и `sqlite3`; с MySQL/MariaDB — одна настройка в панели управления. **Не поддерживается:** образ Docker, в котором всё ещё Rebecca 0.0.x (версия на Python), — установщик отклоняет его и ничего не меняет |

Три панели используют три разных шаблонизатора — Go `html/template`, Jinja2 и pongo2, — поэтому каждый дизайн собирается отдельно для каждой панели, и каждая версия проверяется отрисовкой настоящим движком этой панели. Установщик определяет, какая панель стоит на сервере; если их несколько, он спрашивает (или читает `RT_PANEL`). **Поддерживается** означает, что для этой панели есть все семь возможностей — обнаружение, установка, активация, проверка, резервная копия, восстановление и удаление, — и каждая из них покрыта тестами. Подробности по каждой панели — в разделе [Совместимость](https://iitzseridev.github.io/Row-Template/compatibility/).

**Ограничения 1.3.0:**

- **Живое обновление — только в 3X-UI.** В PasarGuard и Rebecca страница показывает расход и срок действия на момент открытия.
- **Образ Docker для Rebecca отклоняется.** Это всё ещё 0.0.x, версия на Python; собственная команда Rebecca `rebecca migrate-binary` переводит установку Docker на 1.x.
- **Одна настройка вручную**, когда автоматическая активация невозможна: 3X-UI без `sqlite3`, а также Rebecca с MySQL/MariaDB или без `sqlite3`.
- **Настройки панели по-прежнему имеют приоритет** в PasarGuard и Rebecca: собственный шаблон подписки администратора и настройка PasarGuard **disable subscription template**. `row-template verify` сообщает о них.
- **Заголовок страницы PasarGuard** (`subTitle`) и **шаблоны Clash** не создаются — только страница подписки.
- **Одна панель на сервер.** Установка обслуживает панель, для которой она выполнена; чтобы обслуживать другую, сначала выполните `row-template uninstall`.

## Архитектура

```mermaid
flowchart TB
  subgraph build ["Build and release"]
    direction LR
    SRC["src/<br/>runtime, styles, locales,<br/>17 design layouts"] --> BUILD["tools/build.mjs"]
    BUILD --> ART["One self-contained<br/>HTML file per design,<br/>per panel"]
    ART --> REL["tools/make-release.sh<br/>tarball + SHA256SUMS"]
  end
  subgraph host ["Your panel server"]
    direction LR
    INST["install.sh / row-template<br/>verify checksum, detect panel,<br/>back up, activate, verify"] --> DIR["3X-UI: subThemeDir<br/>PasarGuard: .env block<br/>Rebecca: subscription settings"]
    DIR --> XUI["The panel renders the page<br/>with the subscriber's data"]
  end
  build -- "GitHub Releases" --> host
  host -- "serves the page" --> BROWSER["Subscriber's browser"]
  BROWSER -. "live status (3X-UI): ?format=info" .-> host
```

- **Один файл на дизайн.** `tools/build.mjs` встраивает общий код, переводы, шрифты и генератор QR в макет дизайна и отклоняет макет, в котором нет хотя бы одной нужной коду точки привязки (hook). Затем `tools/verify.mjs` отклоняет файл, который загружает что-либо извне или содержит запрещённую конструкцию.
- **Страницу отрисовывает панель.** Страница — это шаблон: панель подставляет данные подписчика при выдаче. Для PasarGuard (Jinja2) и Rebecca (pongo2) каждый дизайн обёрнут в небольшую преамбулу, которая сопоставляет собственные данные панели полям страницы и экранирует каждое значение.
- **Установщик никогда не патчит вашу панель.** В 3X-UI он направляет `subThemeDir` на свой каталог; в PasarGuard кладёт страницу в каталог шаблонов и дописывает в `.env` один помеченный блок; в Rebecca кладёт страницу и задаёт поля страницы и каталога в настройках подписки. Перед каждым изменением делается снимок, и при любом сбое всё точно восстанавливается.

| Путь | Содержимое |
| ---- | ---------------- |
| `src/` | Код, стили и переводы страницы; каждый дизайн — в `src/templates/<id>/` |
| `template/index.html` | Собранная страница Row, хранится в репозитории |
| `tools/` | Сборка, проверка, релизы и рендерер фикстур на Go |
| `installer/` | `install.sh`, команда `row-template`, её библиотека управления и по одному адаптеру на панель в `installer/panels/` |
| `tests/` | Наборы тестов |
| `docs/` | Сайт документации; проектные записи — в [`docs/design/`](docs/design/README.md) |

## Установка

> **Рекомендуемая ОС: Ubuntu 24.04 LTS (x86_64).** Другие современные дистрибутивы Linux могут работать, но не проходили такого же объёма проверок.

**Требования:** сервер с 3X-UI **>= 3.6.0**, PasarGuard **5.x** или Rebecca **1.x** (бинарная установка; образ Docker 0.0.x не поддерживается); root-доступ к нему; `curl`, `tar` и `sha256sum` (есть практически в любой системе Linux). Для автоматической активации в 3X-UI и Rebecca также нужен `sqlite3`.

Запустите от имени **root** на сервере, где работает ваша панель:

```bash
bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
```

Установщик:

1. Скачивает последний стабильный релиз с GitHub.
2. Проверяет его контрольную сумму SHA-256 (обязательно — без возможности обойти).
3. Определяет вашу панель, безопасно распаковывает релиз и устанавливает его в `/etc/3x-ui/sub_templates/row-template` (3X-UI) или `/etc/row-template` (PasarGuard, Rebecca).
4. При новой установке предлагает выбрать дизайн (Enter оставляет Row).
5. Запрашивает ваше оформление (название сервиса, ссылка на поддержку, логотип — всё необязательно).
6. Создаёт и проверяет страницу, а затем, если возможно, активирует её в панели.

Чтобы выбрать дизайн без меню выбора, например в скрипте:

```bash
RT_TEMPLATE=editorial bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
```

На сервере, где работает несколько поддерживаемых панелей, установщик спрашивает, какую обслуживать. Новая установка скриптом (не в интерактивном режиме) на таком сервере **обязана** указать панель через `RT_PANEL` (`3xui`, `pasarguard` или `rebecca`); без него установщик останавливается, ничего не изменив:

```bash
RT_PANEL=pasarguard bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
```

`RT_PANEL` должен называть панель, установленную на этом сервере. Повторный запуск и обновление сохраняют панель, для которой установлен Row-Template.

Если вы не хотите запускать скрипт прямо из сети, скачайте четыре файла релиза (`install.sh`, `manifest.txt`, `SHA256SUMS` и `row-template-<version>.tar.gz`) со [страницы релизов](https://github.com/frank0live/Row-Template/releases/latest) в одну папку, проверьте контрольную сумму самостоятельно, как описано в [PROVENANCE.md](PROVENANCE.md), и укажите установщику эту папку:

```bash
RT_RELEASE_DIR=/root/row-template-release bash /root/row-template-release/install.sh
```

### Активация

Интерактивная установка сначала показывает, что изменит активация, и спрашивает разрешения. В PasarGuard и Rebecca активация выполняется как транзакция: состояние панели сохраняется в снимок, изменение применяется и проверяется, а при сбое любого шага панель точно восстанавливается.

**3X-UI.** Row-Template устанавливается в каталог, который панель отдаёт как страницу подписки:

```
/etc/3x-ui/sub_templates/row-template
```

- **Автоматически:** если доступен `sqlite3`, Row-Template настраивает это за вас. Он ненадолго останавливает службу панели, записывает настройку, снова запускает службу и проверяет значение.
- **Вручную:** иначе откройте **Panel Settings → Subscription → Profile → Sub Theme Directory** и введите в точности:

  ```
  /etc/3x-ui/sub_templates/row-template
  ```

**PasarGuard.** Страница размещается в `/var/lib/pasarguard/templates/row-template/index.html` (или в вашем `CUSTOM_TEMPLATES_DIRECTORY`, если он задан), а в `/opt/pasarguard/.env` дописывается помеченный блок:

```
# >>> row-template (managed by Row-Template; do not edit) nl=0 >>>
CUSTOM_TEMPLATES_DIRECTORY = "/var/lib/pasarguard/templates"
SUBSCRIPTION_PAGE_TEMPLATE = "row-template/index.html"
# <<< row-template <<<
```

PasarGuard читает `.env` при запуске, поэтому работающая панель перезапускается один раз. Ни одна ваша строка не редактируется; удаление убирает блок и возвращает `.env` точно к прежним байтам. Администратор с собственным шаблоном подписки или настройка **disable subscription template** по-прежнему имеют приоритет — `row-template verify` сообщит, если действует что-то из этого.

**Rebecca.** Страница размещается в `/var/lib/rebecca/templates/row-template/index.html` (или в вашем собственном каталоге шаблонов), а в настройках подписки Rebecca выбирается `row-template/index.html`. Rebecca читает эти настройки при каждом запросе, поэтому перезапуск не нужен.

- **Автоматически** — с базой SQLite по умолчанию и установленным `sqlite3`.
- **Вручную** — с MySQL/MariaDB (или без `sqlite3`): страница всё равно размещается; в панели управления Rebecca откройте **Settings → Subscription → Templates** и задайте **Subscription page template** = `row-template/index.html` и **Custom templates directory** = `/var/lib/rebecca/templates`.

Row-Template поддерживает Rebecca **1.x** — версию на Go, которую Rebecca публикует для бинарной установки (`rebecca-binary.sh`). Образ `rebeccapanel/rebecca` на Docker Hub всё ещё версии 0.0.x на Python, которая не может отрисовать эту страницу; установщик отклоняет её и ничего не меняет, а собственная команда Rebecca `rebecca migrate-binary` переводит установку Docker на 1.x.

## Использование

Запустите менеджер без аргументов в терминале, чтобы открыть интерактивное меню:

```bash
row-template
```

Или используйте команду напрямую:

| Команда | Что делает |
| ------- | ------------ |
| `row-template config` | Меняет название сервиса, ссылку на поддержку или логотип и заново создаёт страницу |
| `row-template update` | Скачивает, проверяет и активирует последний стабильный релиз (проверка контрольной суммы обязательна) |
| `row-template rollback` | Восстанавливает предыдущую версию (`--auto` или `--to <backup>`) |
| `row-template verify` | Проверяет установку, связь с панелью и работающую страницу (от root также возвращает на место отсутствующие или перемещённые дизайны) |
| `row-template version` | Показывает установленную версию и обслуживаемую панель (в 3X-UI — также минимально поддерживаемую и обнаруженную версии) |
| `row-template uninstall` | Удаляет Row-Template и возвращает панели страницу, которая была до него |
| `row-template help` | Показывает справку |

Команды, изменяющие систему (`config`, `update`, `rollback`, `uninstall`), нужно запускать от имени root.

- **Оформление** хранится как данные, никогда не выполняется и вставляется в страницу как текст. Оставьте поле пустым, чтобы получить страницу без брендинга. Ссылка на поддержку принимает только схемы, которые браузер должен открывать, например `https://…`, `tg://…` или `mailto:…`.
- **Обновления** берутся из публичного стабильного канала. `row-template update` всегда применяет последний стабильный релиз, даже если он уже установлен; пункт **Update** в менеджере сначала сравнивает версии и спрашивает перед любым изменением. Если источник релизов недоступен, ничего не меняется, и установка никогда не считается повреждённой.
- **Обновление с 1.1.0 или 1.2.0** выполняется одним запуском `row-template update`. Механизм обновления самой версии 1.1.0 копирует лишь часть нового релиза, поэтому следующий запуск `row-template`, `row-template config` или `row-template verify` от root сначала загружает остальную часть того же релиза — все дизайны, с проверкой контрольных сумм. Ваш дизайн, оформление и подключение к панели сохраняются. Прежние релизы не устанавливались на PasarGuard и Rebecca; там запустите установщик.
- **Откат** восстанавливает предыдущую версию из проверенной резервной копии. Сначала делается снимок (snapshot) текущей версии, поэтому неудачный откат можно исправить, а ваше оформление сохраняется. Резервные копии запоминают панель, на которой созданы, и никогда не восстанавливаются на другую; копия из старого релиза, в которой не записан дизайн, восстанавливается как Row. Откат восстанавливает страницу и записанную в копии версию, но не сам менеджер `row-template`: после отката к копии 1.1.0 `row-template version` показывает 1.1.0, менеджер 1.3.0 остаётся на месте, а следующий `row-template update` возвращает 1.3.0. Хранятся только две самые новые резервные копии — каждое обновление, смена дизайна и откат создают по одной.
- **Удаление** стирает файлы Row-Template и возвращает панели страницу, которая была до него: в 3X-UI очищает `subThemeDir`, только если та указывает на Row-Template; в PasarGuard убирает свой блок из `.env` и свою страницу; в Rebecca восстанавливает две изменённые настройки подписки (и не трогает их, если вы с тех пор выбрали другую страницу). Ваши пользователи, inbound'ы, клиенты, ноды и сертификаты не затрагиваются.

[Документация](https://iitzseridev.github.io/Row-Template/) подробнее описывает настройку, оформление и устранение неполадок.

## Разработка

Страницы собираются из читаемых исходников в `src/`. Нужен Node.js 22 или новее; для запуска тестов — также Go 1.22 или новее и Python 3 с Jinja2 (`pip install jinja2`), которые отрисовывают страницы PasarGuard и Rebecca настоящими движками этих панелей.

```bash
npm run build          # regenerate template/index.html from src/
npm run verify         # check the built page against the safety gates
npm test               # render the fixture pages, then run every test suite
npm run fixtures:all   # render every design's fixture pages on their own
npm run lint:sh        # ShellCheck every shell script
npm run preview        # preview the fixture pages at http://127.0.0.1:8787
```

Сборка детерминирована — одни и те же исходники всегда дают побайтно идентичный `template/index.html`. Сайт документации — отдельное рабочее пространство в `docs/`; см. [docs/README.md](docs/README.md).

## Тестирование

- **`npm test`** сначала создаёт страницы фикстур всех дизайнов рендерером на Go, а затем запускает наборы тестов: скрипты страницы, сборку, итоговый файл каждого дизайна, страницы PasarGuard и Rebecca, отрисованные настоящими Jinja2 и pongo2 (в том числе с враждебными и повреждёнными данными), содержимое релиза и установщик — его опубликованная shell-библиотека и адаптер каждой панели выполняются в настоящем `bash` на временных хостах, устроенных как официальная установка каждой панели.
- **`npm run verify`** проверяет собранную страницу по её правилам безопасности, в том числе: цельный документ, замена всех маркеров сборки, всё встроено, нет внешних ссылок, нет запрещённых конструкций, целые переводы и отсутствие невидимых символов в исходниках.
- **`npm run lint:sh`** завершается ошибкой при любой ошибке ShellCheck; `npm run lint:sh -- -S warning` показывает полный отчёт.
- **Workflow Docs** собирает сайт документации в каждом pull request, который его меняет.

## Дорожная карта

Направление, а не обещания:

- **Статус в реальном времени в PasarGuard и Rebecca** — обе отдают его по суффиксу пути, а не через `?format=info`; для подключения нужно небольшое изменение в коде, и это решение отложено. См. [Совместимость](https://iitzseridev.github.io/Row-Template/compatibility/).
- **Собственные шаблоны** — предложение о добавлении своего дизайна: [`docs/design/CUSTOM-TEMPLATES-PROPOSAL.md`](docs/design/CUSTOM-TEMPLATES-PROPOSAL.md).

## Участие в проекте

Сообщения об ошибках, переводы и исправления документации очень приветствуются. Прочитайте [CONTRIBUTING.md](CONTRIBUTING.md), прежде чем открывать pull request, и соблюдайте [Кодекс поведения](CODE_OF_CONDUCT.md).

**Сообщения об ошибках:** создайте issue на <https://github.com/frank0live/Row-Template/issues>. Укажите версию Row-Template (`row-template version`), вашу панель и её версию, операционную систему и её версию, архитектуру процессора, вывод `row-template verify` и чёткие шаги для воспроизведения.

> **Не указывайте секретные данные.** Никогда не вставляйте URL подписок, значения `subId`, UUID клиентов, имена пользователей и пароли панели, cookie, токены, панельный `webBasePath`, содержимое `.env`, URL баз данных, ключи TLS или реальные адреса серверов. Скрывайте конфиденциальные данные в логах перед тем, как ими делиться.

## Безопасность

Нашли уязвимость? Пожалуйста, сообщите о ней приватно — см. [SECURITY.md](SECURITY.md). Не создавайте публичный issue по проблемам безопасности. [PROVENANCE.md](PROVENANCE.md) объясняет, как собираются релизы и как их проверить.

## Поддержать проект

Row-Template — бесплатный проект с открытым исходным кодом. Если он экономит вам время, вы можете поддержать его развитие:

- **USDT (BEP20 / BNB Smart Chain):**

  ```
  0x2606551375987cec71F5fC033968B638A7a4bae4
  ```

- **TRON:**

  ```
  TYD5RFfiYrcETzWNSkAhfwgmRu1wQBbs6W
  ```

- **NOWPayments:** <https://nowpayments.io/donation/iitzfrank0live>

Спасибо.

## Лицензия

Распространяется под [лицензией MIT](LICENSE). Входящий в комплект генератор QR-кодов (`src/vendor/uqr`) включён под собственной лицензией MIT, а встроенное подмножество шрифта Vazirmatn — под лицензией SIL Open Font License (`src/fonts/OFL.txt`).

## Разработчик

Создано и поддерживается **frank0live** — <https://github.com/frank0live/Row-Template>
