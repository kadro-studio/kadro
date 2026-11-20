# Kadro в Steam

Kadro выходит в Steam как бесплатное приложение типа **Software** (жанр Video Production). Сборка для Steam — та же программа, но обновляет её Steam: своё обновление с GitHub в ней выключено (`kadroStore: "steam"` в package.json внутри `app.asar`), в Настройках вместо переключателя написано «Эту копию обновляет Steam». Оверлей Steam для Software выключен самим Steam, ничего настраивать не нужно.

В этой папке:
- `store.md` — тексты страницы на трёх языках, системные требования, ответы для анкеты о содержимом;
- `ids.json` — App ID и ID депо (появляются после создания приложения в Steamworks).

Картинки для страницы (обложки всех размеров, иконки, по 5 скриншотов 1920×1080 на каждом языке) лежат вне репозитория, в `release/steam/store/`. На обложках только логотип и название (так требует Steam), кадры в них — из встроенных фонов Kadro, без текста.

## Выпуск версии в Steam

```bash
npm run dist:steam
```

Собирает папку `release/steam/win-unpacked` (без установщика: ставит Steam).

```bash
npm run steam:upload -- <аккаунт Steam для сборок>
```

Загружает эту папку в депо из `ids.json` через steamcmd (`STEAMCMD` — путь к нему, по умолчанию `C:\steamcmd\steamcmd.exe`). Пароль и код Steam Guard steamcmd спрашивает сам. Скрипт отказывается загружать не-Steam сборку. Сборка не становится доступной сама: Steamworks → SteamPipe → Builds → выбрать сборку → ветка `default` → Preview Change → Set Build Live Now.

Обычный выпуск на GitHub (`npm run dist`, релиз с `latest.yml`) делается как раньше; версии в Steam и на GitHub совпадают.

## Первый раз: Steamworks

1. Аккаунт: partner.steamgames.com → Steam Direct → регистрация, соглашение, налоговая анкета (для частного лица из Украины — W-8BEN), банк, проверка личности (15–30 дней). Взнос Steam Direct — 100 $ за приложение.
2. Создать приложение (тип Software) после оплаты взноса. С оплаты до выхода — не меньше 21 дня.
3. App ID и ID депо (Steamworks → SteamPipe → Depots; Windows, 64-bit) — в `steam/ids.json`.
4. Installation → General Installation → Launch Options: Executable `Kadro.exe`, Operating System Windows, CPU Arch 64-bit. Опубликовать изменения (Publish).
5. Страница магазина (Store Page Admin):
   - Basic Info: название Kadro, разработчик и издатель, сайт `https://kadro.studio`, ссылки (GitHub, Discord и т. п. — только здесь, не в описании); жанр Video Production; языки — English, Ukrainian, Russian (интерфейс); цена — бесплатно.
   - Description: тексты из `store.md`, по языку в каждом редакторе.
   - Graphical Assets: файлы из `release/steam/store/capsules` — `header_capsule` (920×430), `small_capsule` (462×174), `main_capsule` (1232×706), `vertical_capsule` (748×896), `page_background` (1438×810, по желанию); Library: `library_capsule` (600×900), `library_header` (920×430), `library_hero` (3840×1240), `library_logo` (1280×720, прозрачный).
   - Screenshots: 5 файлов из `release/steam/store/screenshots` без суффикса; украинские и русские (`_ukrainian`, `_russian`) — перетащить на соответствующие миниатюры в режиме языка. Все пять — для всех возрастов.
   - Community Assets: `app_icon.jpg` (184×184), иконка ярлыка `shortcut_icon.ico`.
   - System Requirements и анкета о содержимом — из `store.md`.
6. Страницу «Скоро выйдет» открыть минимум за 2 недели до выхода (Store Page → Coming Soon), затем отправить страницу и сборку на проверку Valve (несколько дней).
7. Выход: Release App.

## Что отличается от версии с сайта

- Обновления приходят через Steam, не с GitHub.
- Steam не связывает с Kadro файлы `.vrproj`, `.kadroitem`, `.vrmod` (это делает установщик с сайта); их можно открывать из программы или перетаскивать в окно. Ссылки `kadro://` (кнопка «Открыть в Kadro» на сайте мастерской) программа регистрирует сама при запуске.
- Данные пользователя — там же, где у версии с сайта (`%APPDATA%\Kadro`), поэтому обе версии видят одни и те же проекты, модели ИИ и настройки.
