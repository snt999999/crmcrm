/* СОЛНЦАНЕТ v65: update-zayavka для Cloudflare Pages Functions.
   В этой версии все вспомогательные функции внутри одного файла.
   Это убирает ошибку сборки Pages Functions, которая могла появляться из-за импорта ./_nocodb.js.
*/

const DEFAULT_MAX_RETRIES = 6;
const DEFAULT_BASE_DELAY_MS = 700;

export async function onRequest(context) {
  const options = handleOptions(context.request);
  if (options) return options;

  if (!["POST", "PATCH", "PUT"].includes(context.request.method)) {
    return json({ ok: false, error: "Метод не поддерживается" }, 405);
  }

  try {
    const body = await readJson(context.request);
    const id = body.id || body.Id || body.recordId;
    const rawFields = body.fields || body.data || body.record || {};
    if (!id) return json({ ok: false, error: "Не передан id записи" }, 400);

    const fields = cleanFields(rawFields);
    const endpoint = recordsEndpoint(context.env);
    const url = `${endpoint}/${encodeURIComponent(id)}`;

    const patchResult = await ncFetch(context, url, {
      method: "PATCH",
      headers: authHeaders(context.env),
      body: JSON.stringify(fields)
    });

    let verified = normalizeRecordPayload(patchResult.data, id);
    let missing = diffMissing(fields, verified.fields);

    // NocoDB иногда сразу после PATCH возвращает старую версию записи.
    // Поэтому несколько раз перечитываем запись перед тем, как делать вывод.
    for (let i = 0; missing.length && i < 5; i++) {
      await sleep(450 + i * 350);
      const readResult = await ncFetch(context, url, {
        method: "GET",
        headers: authHeaders(context.env)
      });
      verified = normalizeRecordPayload(readResult.data, id);
      missing = diffMissing(fields, verified.fields);
    }

    const criticalAutoMiss = missing.filter((x) => [
      "Направление",
      "Авто",
      "Авто услуги",
      "Общая стоимость"
    ].includes(x.key));

    if (criticalAutoMiss.length) {
      const text = criticalAutoMiss
        .map((x) => `${x.key}: отправлено «${x.sent}», в базе «${x.saved}»`)
        .join("; ");
      const err = new Error(
        `NocoDB не сохранил авто-поля. Проверьте, что в таблице заявок есть колонки: Направление, Авто, Авто услуги, Общая стоимость. ${text}`
      );
      err.status = 409;
      err.details = { missing: criticalAutoMiss, sent: fields, saved: verified.fields };
      throw err;
    }

    // Возвращаем формат, совместимый со старым admin.js: { record: { id, fields } }.
    // Некритичные поля подмешиваем из отправки, чтобы фронт не падал на ложной проверке.
    const responseFields = { ...verified.fields, ...fields };
    return json({
      ok: true,
      record: { id: verified.id || String(id), fields: responseFields },
      saved: true,
      meta: {
        version: "v65-update-zayavka-single-file",
        patchAttempts: patchResult.attempts,
        unchecked: missing.map((x) => x.key)
      }
    });
  } catch (error) {
    return errorJson(error);
  }
}

function cleanFields(input) {
  const fields = { ...(input || {}) };
  const isAuto = isAutoDirection(fields);

  if (isAuto) {
    fields["Направление"] = "Авто";
    fields["Итоговый м2"] = "";
    fields["Итоговый м²"] = "";
    fields["м2"] = "";
    fields["Адрес"] = "";
    fields["Пленка"] = "";
    fields["Плёнка"] = "";
    normalizeAutoServices(fields);
  }

  return fields;
}

function isAutoDirection(fields) {
  const raw = norm(fields["Направление"] || fields["Тип направления"] || fields["Категория"] || "");
  if (raw.includes("авто") || raw === "auto") return true;
  return Boolean(fields["Авто"] || fields["Авто услуги"]);
}

function normalizeAutoServices(fields) {
  let items = [];
  const raw = fields["Авто услуги"];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    } catch (_) {}
  }

  const clean = items
    .map((x) => ({
      name: String((x && (x.name || x.service || x.title)) || "").trim(),
      material: String((x && x.material) || "").trim(),
      price: String((x && (x.price || x.sum || x.amount)) || "")
        .replace(/[^\d.,-]/g, "")
        .replace(",", ".")
        .trim()
    }))
    .filter((x) => x.name || x.material || x.price);

  fields["Авто услуги"] = JSON.stringify(clean);
  fields["Общая стоимость"] = String(clean.reduce((sum, x) => sum + (Number(x.price) || 0), 0));

  if (clean.length) {
    fields["Услуга"] = clean
      .map((x) => [
        x.name,
        x.material ? `(${x.material})` : "",
        x.price ? `${Number(x.price).toLocaleString("ru-RU")} ₽` : ""
      ].filter(Boolean).join(" "))
      .join("; ");
  }
}

function diffMissing(sentFields, savedFields) {
  const skip = new Set(["Итоговый м²", "Итоговый м2", "м2", "Адрес", "Пленка", "Плёнка"]);
  const result = [];

  for (const [key, sentValue] of Object.entries(sentFields || {})) {
    if (skip.has(key)) continue;
    if (sentValue === "" || sentValue === null || sentValue === undefined) continue;
    const savedValue = valueByAlias(savedFields || {}, key);
    if (!sameValue(sentValue, savedValue)) {
      result.push({ key, sent: printable(sentValue), saved: printable(savedValue) });
    }
  }

  return result;
}

function valueByAlias(fields, key) {
  if (fields[key] !== undefined) return fields[key];
  if (key === "Направление") return fields["Тип направления"] ?? fields["Категория"] ?? "";
  if (key === "Авто услуги") return fields["Услуги авто"] ?? fields["Auto services"] ?? fields["AutoServices"] ?? "";
  if (key === "Общая стоимость") return fields["Стоимость"] ?? fields["Сумма"] ?? fields["Итого"] ?? "";
  return "";
}

function sameValue(a, b) {
  const ja = tryJson(a);
  const jb = tryJson(b);
  if (ja !== null || jb !== null) return JSON.stringify(ja ?? a) === JSON.stringify(jb ?? b);
  return normPrintable(a) === normPrintable(b);
}

function tryJson(value) {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || !(s.startsWith("[") || s.startsWith("{"))) return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

function printable(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function normPrintable(value) {
  return norm(printable(value));
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-requested-with,idempotency-key,x-admin-password"
  };
}

function handleOptions(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  return null;
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (_) { throw new Error("Некорректный JSON в теле запроса"); }
}

function recordsEndpoint(env) {
  if (env.NOCODB_RECORDS_ENDPOINT) return trimSlash(env.NOCODB_RECORDS_ENDPOINT);

  const apiUrl = trimSlash(env.NOCODB_API_URL || "");
  const tableId = env.NOCODB_TABLE_ID || env.NOCODB_REQUESTS_TABLE_ID;

  if (!apiUrl) throw new Error("Не задан NOCODB_API_URL или NOCODB_RECORDS_ENDPOINT");
  if (!tableId) throw new Error("Не задан NOCODB_TABLE_ID / NOCODB_REQUESTS_TABLE_ID");

  if (apiUrl.includes("/api/v2/tables/") && apiUrl.endsWith("/records")) return apiUrl;
  return `${apiUrl}/api/v2/tables/${encodeURIComponent(tableId)}/records`;
}

function authHeaders(env, extra = {}) {
  const token = env.NOCODB_API_TOKEN || env.NOCODB_TOKEN || env.XC_TOKEN;
  if (!token) throw new Error("Не задан NOCODB_API_TOKEN / NOCODB_TOKEN / XC_TOKEN");
  return {
    "accept": "application/json",
    "content-type": "application/json",
    "xc-token": token,
    ...extra
  };
}

async function ncFetch(context, url, options = {}, attempt = 0) {
  const env = context.env || {};
  const maxRetries = toInt(env.NOCODB_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const baseDelay = toInt(env.NOCODB_RETRY_BASE_MS, DEFAULT_BASE_DELAY_MS);
  const started = Date.now();

  let response;
  let text = "";

  try {
    response = await fetch(url, options);
    text = await response.text();
  } catch (error) {
    if (attempt < maxRetries) {
      await sleep(delayMs(baseDelay, attempt));
      return ncFetch(context, url, options, attempt + 1);
    }
    throw new Error(`Ошибка сети NocoDB: ${error.message}`);
  }

  const retryable = [429, 500, 502, 503, 504].includes(response.status);
  if (!response.ok && retryable && attempt < maxRetries) {
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    await sleep(retryAfter || delayMs(baseDelay, attempt));
    return ncFetch(context, url, options, attempt + 1);
  }

  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch (_) { data = { raw: text }; }
  }

  if (!response.ok) {
    const message = data?.message || data?.msg || data?.error || data?.raw || response.statusText || "Ошибка NocoDB";
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    error.durationMs = Date.now() - started;
    throw error;
  }

  return { status: response.status, data, durationMs: Date.now() - started, attempts: attempt + 1 };
}

function normalizeRecordPayload(payload, fallbackId = "") {
  const row = payload?.record || payload?.data || payload?.item || payload;
  if (!row || typeof row !== "object") return { id: String(fallbackId || ""), fields: {} };

  if (row.fields && typeof row.fields === "object") {
    return { id: String(row.id ?? row.Id ?? fallbackId ?? ""), fields: { ...row.fields } };
  }

  const id = row.id ?? row.Id ?? row.ID ?? row.ncRecordId ?? fallbackId ?? "";
  const fields = { ...row };
  delete fields.id;
  delete fields.Id;
  delete fields.ID;
  delete fields.ncRecordId;

  return { id: String(id), fields };
}

function errorJson(error, fallbackStatus = 500) {
  const status = Number(error.status || fallbackStatus || 500);
  return json({
    ok: false,
    error: error.message || "Ошибка сервера",
    details: error.details || null
  }, status >= 400 && status < 600 ? status : 500);
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayMs(baseDelay, attempt) {
  return Math.min(12000, baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * 350);
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const sec = Number(value);
  if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}
