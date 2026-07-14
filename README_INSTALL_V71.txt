СОЛНЦАНЕТ CRM v71 PRE-V66 CLASSIC FULL

Что это за версия:
- Откат визуальной оболочки к старому сине-белому оформлению до clean/full обновлений.
- Полный комплект для пустого GitHub: index.html, admin.html, zapis.html, assets, functions, docs, .github, service-worker.js, manifest.webmanifest.
- Сохранены последние нужные функции: авто-направление без итогового м²/адреса/общего материала сверху, SMS-автоматика и SMS-очередь.

Что удалить перед загрузкой:
- На GitHub должен быть пустой репозиторий или удалены все старые файлы.
- Не оставлять старые service-worker-v62.js, service-worker-v63.js и admin-v62/admin-v63/admin-v64 патчи рядом с этой сборкой.

Как загрузить:
1. Распакуйте архив.
2. Откройте папку SOLNCANET_CRM_V71_PRE_V66_CLASSIC_FULL.
3. Загрузите на GitHub именно содержимое папки, не саму папку.
4. В корне GitHub должны лежать: index.html, admin.html, zapis.html, assets, functions, docs, .github, service-worker.js, manifest.webmanifest, robots.txt.
5. Дождитесь деплоя Cloudflare Pages.
6. Откройте /admin.html и нажмите Проверка → Очистить кеш браузера.

Важно по NocoDB:
- Для заявок нужны колонки из docs/NOCODB_COLUMNS_V71.txt.
- Для SMS-очереди нужны переменные из docs/CLOUDFLARE_ENV_V71.txt.
