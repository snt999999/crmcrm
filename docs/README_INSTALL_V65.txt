СОЛНЦАНЕТ CRM v65 — исправление ошибки сборки Cloudflare Pages Functions

Проблема:
В v64 была функция update-zayavka.js, которая импортировала helper-файл functions/_nocodb.js.
На некоторых сборках Cloudflare Pages это может ломать этап "generating Pages Functions".

Что сделано в v65:
1. Удалён импорт ./_nocodb.js.
2. Вся логика NocoDB перенесена в один файл functions/update-zayavka.js.
3. Фронтовая правка авто-полей перенесена в assets/admin-v65-auto-clean-save-fix.js.

Как поставить:
1. Удалить из проекта файл:
   functions/_nocodb.js

2. Заменить файл:
   functions/update-zayavka.js
   на файл из этого архива.

3. Загрузить файл:
   assets/admin-v65-auto-clean-save-fix.js

4. В admin.html подключить после основного admin.js и после прошлых патчей:
   <script src="assets/admin-v65-auto-clean-save-fix.js?v=65"></script>

5. Если ранее подключали v64:
   <script src="assets/admin-v64-auto-clean-save-fix.js?v=64"></script>
   его можно убрать, чтобы не было дубля.

Важно:
В Cloudflare Pages переменные окружения должны быть заполнены:
- NOCODB_API_URL
- NOCODB_TABLE_ID или NOCODB_REQUESTS_TABLE_ID
- NOCODB_API_TOKEN или NOCODB_TOKEN или XC_TOKEN

В NocoDB в таблице заявок должны быть колонки:
- Направление
- Авто
- Авто услуги
- Общая стоимость
