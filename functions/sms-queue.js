const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-admin-password,xc-token,idempotency-key,x-cron-secret"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...CORS } });
}
function options(request) { return request.method === "OPTIONS" ? new Response(null, { status:204, headers:CORS }) : null; }
async function readBody(request) { const text = await request.text(); if (!text) return {}; try { return JSON.parse(text); } catch { throw makeError("Некорректный JSON", 400); } }
function makeError(message, status = 500, details = null) { const e = new Error(message); e.status = status; e.details = details; return e; }
function err(error) { return json({ ok:false, error:error.message || "Ошибка сервера", details:error.details || null }, Number(error.status || 500)); }
function adminOk(request, env) { const expected = env.ADMIN_PASSWORD || env.ADMIN_SECRET || ""; if (!expected) return true; const got = request.headers.get("x-admin-password") || ""; return got === expected; }
function checkAdmin(request, env) { if (!adminOk(request, env)) throw makeError("Нет доступа: неверный ADMIN_PASSWORD", 401); }
function endpoint(env) {
  const exact = env.NOCODB_RECORDS_ENDPOINT || env.NOCODB_ZAYAVKI_ENDPOINT || "";
  if (exact) return String(exact).replace(/\/+$/, "");
  const api = String(env.NOCODB_API_URL || env.NOCODB_URL || "").replace(/\/+$/, "");
  const table = env.NOCODB_TABLE_ID || env.NOCODB_REQUESTS_TABLE_ID || env.NOCODB_ZAYAVKI_TABLE_ID || "";
  if (!api) throw makeError("Не задана переменная NOCODB_API_URL или NOCODB_RECORDS_ENDPOINT", 500);
  if (!table) throw makeError("Не задана переменная NOCODB_TABLE_ID / NOCODB_REQUESTS_TABLE_ID", 500);
  if (api.includes("/api/v2/tables/") && api.endsWith("/records")) return api;
  return `${api}/api/v2/tables/${encodeURIComponent(table)}/records`;
}
function headers(env) {
  const token = env.NOCODB_API_TOKEN || env.NOCODB_TOKEN || env.XC_TOKEN || "";
  if (!token) throw makeError("Не задан токен NOCODB_API_TOKEN / NOCODB_TOKEN / XC_TOKEN", 500);
  return { "accept":"application/json", "content-type":"application/json", "xc-token": token };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function retryAfter(value) { if (!value) return 0; const n = Number(value); if (Number.isFinite(n)) return Math.max(0, n * 1000); const d = Date.parse(value); return Number.isFinite(d) ? Math.max(0, d - Date.now()) : 0; }
async function ncFetch(env, url, init = {}, attempt = 0) {
  const max = Number(env.NOCODB_MAX_RETRIES || 5);
  const base = Number(env.NOCODB_RETRY_BASE_MS || 650);
  let res, text = "";
  try { res = await fetch(url, init); text = await res.text(); }
  catch (e) { if (attempt < max) { await sleep(Math.min(9000, base * Math.pow(2, attempt)) + Math.floor(Math.random()*250)); return ncFetch(env, url, init, attempt + 1); } throw makeError("Ошибка сети NocoDB: " + e.message, 502); }
  const retryable = [429,500,502,503,504].includes(res.status);
  if (!res.ok && retryable && attempt < max) { await sleep(retryAfter(res.headers.get("retry-after")) || Math.min(9000, base * Math.pow(2, attempt)) + Math.floor(Math.random()*250)); return ncFetch(env, url, init, attempt + 1); }
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw:text }; } }
  if (!res.ok) { const m = data?.message || data?.msg || data?.error || data?.raw || res.statusText || "Ошибка NocoDB"; throw makeError(String(m), res.status, data); }
  return { data, status:res.status, attempts:attempt + 1 };
}
function listFrom(payload) { if (Array.isArray(payload)) return payload; if (Array.isArray(payload?.list)) return payload.list; if (Array.isArray(payload?.records)) return payload.records; if (Array.isArray(payload?.data)) return payload.data; return []; }
function getId(record) { return record?.Id ?? record?.id ?? record?.ID ?? record?.ncRecordId ?? record?.fields?.Id ?? record?.fields?.id ?? ""; }
function normalizeRecord(record, fallbackId = "") { if (!record) return { id:String(fallbackId || ""), fields:{} }; const id = getId(record) || fallbackId || ""; const fields = record.fields && typeof record.fields === "object" ? record.fields : record; return { id:String(id), fields }; }
async function listRecords(env, limit = 1000) {
  const params = new URLSearchParams({ limit:String(limit), sort:"Дата записи" });
  const res = await ncFetch(env, `${endpoint(env)}?${params.toString()}`, { method:"GET", headers:headers(env) });
  return listFrom(res.data).map(x => normalizeRecord(x)).filter(x => x.id);
}
async function getRecord(env, id) {
  if (!id) throw makeError("Не передан id заявки", 400);
  try { const res = await ncFetch(env, `${endpoint(env)}/${encodeURIComponent(id)}`, { method:"GET", headers:headers(env) }); return normalizeRecord(res.data, id); } catch (e) {}
  const params = new URLSearchParams({ limit:"1", where:`(Id,eq,${String(id).replaceAll(",","")})` });
  const res = await ncFetch(env, `${endpoint(env)}?${params.toString()}`, { method:"GET", headers:headers(env) });
  const rec = listFrom(res.data)[0];
  if (!rec) throw makeError("Заявка не найдена", 404);
  return normalizeRecord(rec, id);
}
async function patchRecord(env, id, fields) {
  if (!id) throw makeError("Не передан id для обновления", 400);
  try { const res = await ncFetch(env, `${endpoint(env)}/${encodeURIComponent(id)}`, { method:"PATCH", headers:headers(env), body:JSON.stringify(fields) }); return normalizeRecord(res.data, id); }
  catch (firstError) { const withId = { ...fields, Id:Number(id) || id }; const res = await ncFetch(env, endpoint(env), { method:"PATCH", headers:headers(env), body:JSON.stringify(withId) }); return normalizeRecord(res.data, id); }
}
function norm(v) { return String(v || "").toLowerCase().replace(/ё/g,"е").trim(); }
function isTrashStatus(status) { const s = norm(status); return ["удалена","отменена","в корзине","удаление","отказ"].includes(s) || s.includes("удален") || s.includes("отмен"); }
function isDoneStatus(status) { const s = norm(status); return s.includes("выполн") || s.includes("оплачен"); }
function isActiveForSms(fields) { return !isTrashStatus(fields?.["Статус"]) && !isDoneStatus(fields?.["Статус"]); }
function normalizePhone(phone) {
  let p = String(phone || "").trim();
  if (!p) return "";
  p = p.replace(/[^\d+]/g, "");
  if (p.startsWith("8") && p.length === 11) p = "+7" + p.slice(1);
  if (p.startsWith("7") && p.length === 11) p = "+" + p;
  if (!p.startsWith("+") && p.length >= 10) p = "+" + p;
  return /^\+\d{10,15}$/.test(p) ? p : "";
}
function formatRuDate(value) { const s = String(value || "").trim(); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : s; }
function timeValue(fields) { return String(fields?.["Время записи"] || fields?.["Время"] || "").slice(0,5) || "10:00"; }
function dateValue(fields) { return String(fields?.["Дата записи"] || fields?.["Дата"] || "").slice(0,10); }
const SMS_LOG_PATTERN = /\n?\[SOLNCANET_SMS_LOG:([^\]]*)\]\s*$/;
const AUTO_TYPES = ["confirm", "day", "two_hours"];
const TYPE_LABELS = { confirm:"Подтверждение", day:"Напоминание за день", two_hours:"Напоминание за 2 часа", reschedule:"Перенос", review:"Благодарность + отзыв" };
function stripSmsLog(text) { return String(text || "").replace(SMS_LOG_PATTERN, "").trim(); }
function smsLogFromFields(fields) {
  const text = String(fields?.["Комментарий администратора"] || "");
  const match = text.match(SMS_LOG_PATTERN);
  if (!match) return {};
  try { const parsed = JSON.parse(match[1]); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}
function writeSmsLog(fields, log) {
  const copy = { ...(fields || {}) };
  const visible = stripSmsLog(copy["Комментарий администратора"] || "");
  const marker = `[SOLNCANET_SMS_LOG:${JSON.stringify(log || {})}]`;
  copy["Комментарий администратора"] = visible ? `${visible}\n${marker}` : marker;
  return copy;
}
function queueOf(log) { const q = log?.queue; return q && typeof q === "object" ? q : {}; }
function appointmentUtcMs(fields, env) {
  const d = dateValue(fields); if (!d) return NaN;
  const t = timeValue(fields) || "10:00";
  const dm = d.match(/^(\d{4})-(\d{2})-(\d{2})$/); const tm = t.match(/^(\d{1,2}):(\d{2})/);
  if (!dm || !tm) return NaN;
  const offsetMin = Number(env.SMS_TIMEZONE_OFFSET_MINUTES || 300);
  return Date.UTC(Number(dm[1]), Number(dm[2])-1, Number(dm[3]), Number(tm[1]), Number(tm[2])) - offsetMin*60000;
}
function isoFromMs(ms) { return Number.isFinite(ms) ? new Date(ms).toISOString() : ""; }
function localInputToIso(value, env) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) { const ms = Date.parse(s); return Number.isFinite(ms) ? new Date(ms).toISOString() : ""; }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})/);
  if (!m) return "";
  const offsetMin = Number(env.SMS_TIMEZONE_OFFSET_MINUTES || 300);
  const ms = Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4]), Number(m[5])) - offsetMin*60000;
  return new Date(ms).toISOString();
}
function defaultScheduleMs(type, fields, env, nowMs = Date.now()) {
  const appt = appointmentUtcMs(fields, env);
  if (type === "confirm") return nowMs;
  if (!Number.isFinite(appt)) return NaN;
  if (type === "day") return appt - 24*60*60000;
  if (type === "two_hours") return appt - 2*60*60000;
  return NaN;
}
function templateText(env, type) {
  const defaults = {
    confirm:"СОЛНЦАНЕТ: запись оформлена на {Дата} в {Время}.",
    day:"СОЛНЦАНЕТ: напоминаем о записи {Дата} в {Время}.",
    two_hours:"СОЛНЦАНЕТ: до записи осталось 2 часа.",
    review:"Спасибо, что выбрали СОЛНЦАНЕТ! Оставьте отзыв: https://clck.su/solncanet",
    reschedule:"СОЛНЦАНЕТ: запись перенесена на {Дата} в {Время}."
  };
  const envKey = ({confirm:"SMS_TEMPLATE_CONFIRM", day:"SMS_TEMPLATE_DAY", two_hours:"SMS_TEMPLATE_2H", review:"SMS_TEMPLATE_REVIEW", reschedule:"SMS_TEMPLATE_RESCHEDULE"})[type];
  return String((envKey && env[envKey]) || defaults[type] || defaults.confirm);
}
function renderTemplate(env, type, fields, record) {
  const data = { "Дата":formatRuDate(dateValue(fields)), "Время":timeValue(fields), "Имя":fields?.["Имя клиента"] || "", "Телефон":fields?.["Телефон"] || "", "Компания":fields?.["Компания"] || "", "Авто":fields?.["Авто"] || "", "Услуга":fields?.["Услуга"] || "", "ID":record?.id || fields?.Id || "" };
  return templateText(env, type).replace(/\{([^}]+)\}/g, (_, key) => String(data[key] ?? ""));
}
function smsEnabled(env) { return String(env.SMS_ENABLED || "").toLowerCase() === "1" || String(env.SMS_ENABLED || "").toLowerCase() === "true"; }
async function sigmaToken(env) {
  if (env.SIGMASMS_TOKEN || env.SMS_TOKEN) return String(env.SIGMASMS_TOKEN || env.SMS_TOKEN);
  const username = env.SIGMASMS_USERNAME || env.SMS_USERNAME || "";
  const password = env.SIGMASMS_PASSWORD || env.SMS_PASSWORD || "";
  if (!username || !password) throw makeError("Не заданы SIGMASMS_USERNAME / SIGMASMS_PASSWORD", 500);
  const base = String(env.SIGMASMS_API_BASE || "https://online.sigmasms.ru/api").replace(/\/+$/, "");
  const res = await fetch(`${base}/login`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ username, password }) });
  const text = await res.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
  if (!res.ok || !data.token) throw makeError(data.message || data.error || data.raw || "Ошибка авторизации SigmaSMS", res.status || 502, data);
  return data.token;
}
async function sendSms(env, phoneRaw, text, type = "manual") {
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw makeError("Некорректный телефон для SMS", 400);
  if (!text || !String(text).trim()) throw makeError("Пустой текст SMS", 400);
  if (!smsEnabled(env)) return { ok:false, skipped:true, reason:"SMS_ENABLED не включён", phone, text };
  if (String(env.SMS_DRY_RUN || "") === "1") return { ok:true, dryRun:true, id:`dry-${Date.now()}`, phone, text, type };
  if (env.SMS_WEBHOOK_URL) {
    const res = await fetch(env.SMS_WEBHOOK_URL, { method:"POST", headers:{"content-type":"application/json", ...(env.SMS_WEBHOOK_TOKEN ? {"authorization":`Bearer ${env.SMS_WEBHOOK_TOKEN}`} : {})}, body:JSON.stringify({ phone, text, type }) });
    const raw = await res.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!res.ok) throw makeError(data.message || data.error || data.raw || "Ошибка SMS webhook", res.status || 502, data);
    return { ok:true, provider:"webhook", id:data.id || data.message_id || "", data };
  }
  const base = String(env.SIGMASMS_API_BASE || "https://online.sigmasms.ru/api").replace(/\/+$/, "");
  const token = await sigmaToken(env);
  const sender = String(env.SIGMASMS_SENDER || env.SMS_SENDER || "SOLNCANET");
  const body = { recipient:[phone], type:"sms", payload:{ sender, text:String(text) } };
  const res = await fetch(`${base}/sendings`, { method:"POST", headers:{"charset":"utf-8", "content-type":"application/json", "authorization":token}, body:JSON.stringify(body) });
  const raw = await res.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!res.ok) throw makeError(data.message || data.error || data.raw || "Ошибка отправки SMS", res.status || 502, data);
  return { ok:true, provider:"sigmasms", id:data.id || data.message_id || data.uuid || "", data };
}
function buildQueueItem(env, record, type, nowMs = Date.now()) {
  const fields = record?.fields || {};
  const log = smsLogFromFields(fields);
  const q = queueOf(log);
  const qItem = q[type] && typeof q[type] === "object" ? q[type] : {};
  const phone = normalizePhone(fields["Телефон"]);
  const apptMs = appointmentUtcMs(fields, env);
  const defaultMs = defaultScheduleMs(type, fields, env, nowMs);
  const customMs = qItem.scheduledAt ? Date.parse(qItem.scheduledAt) : NaN;
  const scheduleMs = Number.isFinite(customMs) ? customMs : defaultMs;
  const sent = log[type];
  let status = "scheduled", statusLabel = "В очереди", reason = "";
  if (sent) { status = "sent"; statusLabel = "Отправлено"; }
  else if (qItem.status === "canceled") { status = "canceled"; statusLabel = "Отменено"; reason = qItem.reason || "Отменено вручную"; }
  else if (!phone) { status = "blocked"; statusLabel = "Нет телефона"; reason = "Некорректный или пустой телефон"; }
  else if (!isActiveForSms(fields)) { status = "blocked"; statusLabel = "Неактивная заявка"; reason = "Статус заявки не подходит для автоматической SMS"; }
  else if (type !== "confirm" && !Number.isFinite(apptMs)) { status = "blocked"; statusLabel = "Нет даты/времени"; reason = "Не указана дата или время записи"; }
  else if (type !== "confirm" && apptMs <= nowMs) { status = "expired"; statusLabel = "Просрочено"; reason = "Запись уже прошла"; }
  else if (!Number.isFinite(scheduleMs)) { status = "blocked"; statusLabel = "Нет времени отправки"; }
  else if (scheduleMs <= nowMs) { status = "due"; statusLabel = "Пора отправить"; }
  return {
    id:String(record.id || ""),
    type,
    typeLabel:TYPE_LABELS[type] || type,
    status,
    statusLabel,
    reason,
    scheduledAt: Number.isFinite(scheduleMs) ? isoFromMs(scheduleMs) : "",
    defaultScheduledAt: Number.isFinite(defaultMs) ? isoFromMs(defaultMs) : "",
    custom:Boolean(Number.isFinite(customMs)),
    sentAt: sent?.at || (typeof sent === "string" ? sent : ""),
    canceledAt: qItem.canceledAt || "",
    text: renderTemplate(env, type, fields, record),
    phone: fields["Телефон"] || "",
    normalizedPhone: phone,
    customer: fields["Имя клиента"] || fields["Компания"] || "—",
    recordStatus: fields["Статус"] || "",
    direction: fields["Направление"] || "",
    object: fields["Авто"] || fields["Адрес"] || "",
    appointmentDate: dateValue(fields),
    appointmentTime: timeValue(fields),
    canCancel: !sent && !["canceled","expired"].includes(status),
    canRestore: !sent && status === "canceled",
    canEditTime: !sent && !["blocked","expired"].includes(status),
    canSendNow: !sent && !["blocked","expired"].includes(status) && status !== "canceled"
  };
}
function setQueueState(fields, type, update) {
  const log = smsLogFromFields(fields);
  const nextLog = { ...log, queue:{ ...queueOf(log) } };
  if (update === null) delete nextLog.queue[type];
  else nextLog.queue[type] = { ...(nextLog.queue[type] || {}), ...update };
  if (!Object.keys(nextLog.queue).length) delete nextLog.queue;
  return writeSmsLog(fields, nextLog);
}
async function patchSmsLog(env, record, nextLog) {
  const updated = writeSmsLog(record.fields || {}, nextLog);
  await patchRecord(env, record.id, { "Комментарий администратора": updated["Комментарий администратора"] });
}
async function sendSmsForRecord(env, record, type, force = false) {
  const fields = record?.fields || {};
  if (!isActiveForSms(fields) && type !== "review") return { ok:false, skipped:true, reason:"Статус не подходит для SMS" };
  const log = smsLogFromFields(fields);
  if (!force && log[type]) return { ok:true, skipped:true, reason:"SMS уже отправлена", sentAt:log[type]?.at || log[type] };
  const text = renderTemplate(env, type, fields, record);
  const sms = await sendSms(env, fields["Телефон"], text, type);
  if (!sms.ok || sms.skipped) return sms;
  const now = new Date().toISOString();
  const nextLog = { ...log, [type]:{ at:now, id:sms.id || "", type }, queue:{ ...queueOf(log), [type]:{ ...(queueOf(log)[type] || {}), status:"sent", sentAt:now } } };
  await patchSmsLog(env, record, nextLog);
  return { ok:true, sms, text, sentAt:now };
}
async function handlePost(env, body) {
  const action = String(body.action || "").trim();
  const id = String(body.id || "").trim();
  const type = String(body.type || "").trim();
  if (!AUTO_TYPES.includes(type)) throw makeError("Некорректный тип SMS", 400);
  const record = await getRecord(env, id);
  const fields = record.fields || {};
  const log = smsLogFromFields(fields);
  if (log[type] && action !== "send_now") throw makeError("Эта SMS уже отправлена, изменить или отменить её нельзя", 409);
  if (action === "cancel") {
    const next = setQueueState(fields, type, { status:"canceled", canceledAt:new Date().toISOString(), reason:String(body.reason || "Отменено вручную") });
    await patchRecord(env, record.id, { "Комментарий администратора": next["Комментарий администратора"] });
  } else if (action === "restore") {
    const next = setQueueState(fields, type, null);
    await patchRecord(env, record.id, { "Комментарий администратора": next["Комментарий администратора"] });
  } else if (action === "reschedule") {
    const iso = localInputToIso(body.scheduledAt || body.datetime || body.time, env);
    if (!iso) throw makeError("Некорректное время отправки. Формат: 2026-07-09T12:30", 400);
    const apptMs = appointmentUtcMs(fields, env);
    const scheduleMs = Date.parse(iso);
    if (type !== "confirm" && Number.isFinite(apptMs) && scheduleMs >= apptMs) throw makeError("Время SMS должно быть раньше времени записи", 400);
    const next = setQueueState(fields, type, { status:"scheduled", scheduledAt:iso, updatedAt:new Date().toISOString() });
    await patchRecord(env, record.id, { "Комментарий администратора": next["Комментарий администратора"] });
  } else if (action === "send_now") {
    const item = buildQueueItem(env, record, type, Date.now());
    if (["blocked","expired"].includes(item.status)) throw makeError(item.reason || item.statusLabel || "SMS нельзя отправить", 400);
    const result = await sendSmsForRecord(env, record, type, true);
    return { ok:true, action, result, item:buildQueueItem(env, await getRecord(env, record.id), type, Date.now()) };
  } else {
    throw makeError("Неизвестное действие SMS-очереди", 400);
  }
  const fresh = await getRecord(env, record.id);
  return { ok:true, action, item:buildQueueItem(env, fresh, type, Date.now()) };
}
export async function onRequest(context) {
  const o = options(context.request); if (o) return o;
  try {
    const env = context.env || {};
    checkAdmin(context.request, env);
    if (context.request.method === "GET") {
      const url = new URL(context.request.url);
      const limit = Number(url.searchParams.get("limit") || env.SMS_QUEUE_LIMIT || 1000);
      const rows = await listRecords(env, limit);
      const nowMs = Date.now();
      const items = rows.flatMap(record => AUTO_TYPES.map(type => buildQueueItem(env, record, type, nowMs)));
      const stats = items.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
      return json({ ok:true, items, stats, checked:rows.length, version:"v71-legacy-sms-queue" });
    }
    if (context.request.method !== "POST") throw makeError("Метод не поддерживается", 405);
    const body = await readBody(context.request);
    const data = await handlePost(env, body);
    return json(data);
  } catch (e) { return err(e); }
}
