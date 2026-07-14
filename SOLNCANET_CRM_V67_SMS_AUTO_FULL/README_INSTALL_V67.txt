СОЛНЦАНЕТ CRM v67 SMS AUTO
==========================

Это чистая полная сборка поверх v66 с SMS-автоматизацией.
Старые патчи v62/v63/v64/v65 не нужны.

Структура архива готова для GitHub + Cloudflare Pages:

/index.html
/zapis.html
/admin.html
/manifest.webmanifest
/service-worker.js
/assets/...
/functions/...
/docs/...
/.github/workflows/sms-reminders.yml

КАК ЗАГРУЖАТЬ
-------------
1. Распакуйте архив.
2. Откройте папку SOLNCANET_CRM_V67_SMS_AUTO_FULL.
3. В GitHub загружайте содержимое этой папки в корень репозитория, а не саму папку целиком.
4. В корне репозитория должны лежать index.html, admin.html, zapis.html, assets, functions, docs, .github.
5. После деплоя откройте /admin.html.
6. Пароли локального входа: sergey41, roman41, admin, solncanet.

SMS ЛОГИКА
----------
Автоматически:
1. Подтверждение записи — сразу после создания заявки и один раз при сохранении старой заявки, если подтверждение ещё не отправлялось.
2. Напоминание за день — через /sms-cron по расписанию GitHub Actions.
3. Напоминание за 2 часа — через /sms-cron по расписанию GitHub Actions.

Только вручную из карточки заявки:
1. SMS перенос.
2. SMS отзыв.

Важно: перенос НЕ отправляется автоматически при изменении даты или времени.

КАК ВКЛЮЧИТЬ SMS
----------------
В Cloudflare Pages -> Settings -> Environment variables добавьте переменные из docs/CLOUDFLARE_ENV_V67.txt.

В GitHub -> Repository -> Settings -> Secrets and variables -> Actions -> New repository secret добавьте:
SOLNCANET_SITE_URL = адрес сайта Cloudflare Pages, например https://ваш-проект.pages.dev
SMS_CRON_SECRET = тот же секрет, что в Cloudflare переменной SMS_CRON_SECRET

ПРОВЕРКА
--------
1. /admin.html -> Проверка -> Проверить Cloudflare / NocoDB / SMS.
2. Создайте тестовую заявку с телефоном и датой.
3. Если SMS_ENABLED=1 и данные SigmaSMS заполнены, подтверждение уйдёт автоматически.
4. Для проверки напоминаний нажмите "Запустить SMS-напоминания сейчас".

ПРИМЕЧАНИЕ ПО NOCODB
--------------------
Для SMS не нужно создавать отдельные колонки. Система хранит служебные отметки SMS внутри поля "Комментарий администратора" в скрытом маркере [SOLNCANET_SMS_LOG:...].
В админке этот маркер не показывается и в Excel-выгрузке скрывается.
