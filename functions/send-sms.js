
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-admin-password,xc-token,idempotency-key,x-cron-secret"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
}
function options(request) { return request.method === "OPTIONS" ? new Response(null, { status: 204, headers: CORS }) : null; }
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
function retryAfter(value) { if (!value) return 0; const n=Number(value); if (Number.isFinite(n)) return Math.max(0,n*1000); const d=Date.parse(value); return Number.isFinite(d) ? Math.max(0,d-Date.now()) : 0; }
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
  return { data, status: res.status, attempts: attempt + 1 };
}
function listFrom(payload) { if (Array.isArray(payload)) return payload; if (Array.isArray(payload?.list)) return payload.list; if (Array.isArray(payload?.records)) return payload.records; if (Array.isArray(payload?.data)) return payload.data; return []; }
function getId(record) { return record?.Id ?? record?.id ?? record?.ID ?? record?.ncRecordId ?? record?.fields?.Id ?? record?.fields?.id ?? ""; }
function norm(v) { return String(v || "").toLowerCase().replace(/ё/g,"е").trim(); }
function isAuto(fields) { return norm(fields["Направление"]).includes("авто") || Boolean(fields["Авто"] || fields["Авто услуги"]); }
function isTrashStatus(status) { const s=norm(status); return ["удалена","отменена","в корзине","удаление","отказ"].includes(s) || s.includes("удален") || s.includes("отмен"); }
function isDoneStatus(status) { const s=norm(status); return s.includes("выполн") || s.includes("оплачен"); }
function isActiveForSms(fields) { return !isTrashStatus(fields["Статус"]) && !isDoneStatus(fields["Статус"]); }
function parseServices(v) { if (Array.isArray(v)) return v; if (!v) return []; try { const x=JSON.parse(v); return Array.isArray(x)?x:[]; } catch { return []; } }
function num(v) { return Number(String(v || "").replace(/[^\d.,-]/g,"").replace(",",".")) || 0; }
function cleanAutoFields(fields) {
  if (!fields || typeof fields !== "object") return {};
  const copy = { ...fields };
  if (!isAuto(copy)) return copy;
  copy["Направление"] = "Авто";
  copy["м2"] = ""; copy["Итоговый м²"] = ""; copy["Итоговый м2"] = ""; copy["Адрес"] = ""; copy["Плёнка"] = ""; copy["Пленка"] = ""; copy["Материал"] = "";
  const services = parseServices(copy["Авто услуги"]).map(x => ({ name:String(x?.name || x?.service || x?.title || "").trim(), material:String(x?.material || "").trim(), price:String(x?.price ?? x?.sum ?? x?.amount ?? "").replace(/[^\d.,-]/g,"").replace(",",".").trim() })).filter(x => x.name || x.material || x.price);
  copy["Авто услуги"] = JSON.stringify(services);
  copy["Общая стоимость"] = String(services.reduce((s,x)=>s+num(x.price),0));
  if (services.length) copy["Услуга"] = services.map(x => [x.name, x.material ? `(${x.material})` : "", x.price ? `${Number(x.price).toLocaleString("ru-RU")} ₽` : ""].filter(Boolean).join(" ")).join("; ");
  return copy;
}
function normalizeRecord(record, fallbackId = "") { if (!record) return { id:String(fallbackId || ""), fields:{} }; const id = getId(record) || fallbackId || ""; const fields = record.fields && typeof record.fields === "object" ? record.fields : record; return { id:String(id), fields }; }
async function getRecord(env, id) {
  try { const res = await ncFetch(env, `${endpoint(env)}/${encodeURIComponent(id)}`, { method:"GET", headers:headers(env) }); return normalizeRecord(res.data, id); } catch (e) {}
  try { const params = new URLSearchParams({ limit:"1", where:`(Id,eq,${String(id).replaceAll(",","")})` }); const res = await ncFetch(env, `${endpoint(env)}?${params.toString()}`, { method:"GET", headers:headers(env) }); return normalizeRecord(listFrom(res.data)[0], id); } catch (e) {}
  return null;
}
async function patchRecord(env, id, fields) {
  if (!id) throw makeError("Не передан id для обновления", 400);
  try { const res = await ncFetch(env, `${endpoint(env)}/${encodeURIComponent(id)}`, { method:"PATCH", headers:headers(env), body:JSON.stringify(fields) }); return normalizeRecord(res.data, id); }
  catch (firstError) { const withId = { ...fields, Id: Number(id) || id }; const res = await ncFetch(env, endpoint(env), { method:"PATCH", headers:headers(env), body:JSON.stringify(withId) }); return normalizeRecord(res.data, id); }
}
const SMS_LOG_PATTERN = /\n?\[SOLNCANET_SMS_LOG:([^\]]*)\]\s*$/;
const SMS_KEYS = { confirm:"confirm", day:"day", two_hours:"two_hours", reschedule:"reschedule", review:"review" };
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
function mergeExistingSmsLog(fields, existingFields) {
  const existingLog = smsLogFromFields(existingFields || {});
  if (!Object.keys(existingLog).length) return fields;
  const incomingLog = smsLogFromFields(fields || {});
  if (Object.keys(incomingLog).length) return fields;
  return writeSmsLog(fields, existingLog);
}
function normalizePhone(phone) {
  let p = String(phone || "").trim();
  if (!p) return "";
  p = p.replace(/[^\d+]/g, "");
  if (p.startsWith("8") && p.length === 11) p = "+7" + p.slice(1);
  if (p.startsWith("7") && p.length === 11) p = "+" + p;
  if (!p.startsWith("+") && p.length >= 10) p = "+" + p;
  return /^\+\d{10,15}$/.test(p) ? p : "";
}
function formatRuDate(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}
function timeValue(fields) { return String(fields?.["Время записи"] || fields?.["Время"] || "").slice(0,5) || "10:00"; }
function dateValue(fields) { return String(fields?.["Дата записи"] || fields?.["Дата"] || "").slice(0,10); }
function templateText(env, type) {
  const defaults = {
    confirm: "СОЛНЦАНЕТ: запись оформлена на {Дата} в {Время}.",
    day: "СОЛНЦАНЕТ: напоминаем о записи {Дата} в {Время}.",
    two_hours: "СОЛНЦАНЕТ: до записи осталось 2 часа.",
    review: "Спасибо, что выбрали СОЛНЦАНЕТ! Оставьте отзыв: https://clck.su/solncanet",
    reschedule: "СОЛНЦАНЕТ: запись перенесена на {Дата} в {Время}."
  };
  const envKey = ({confirm:"SMS_TEMPLATE_CONFIRM",day:"SMS_TEMPLATE_DAY",two_hours:"SMS_TEMPLATE_2H",review:"SMS_TEMPLATE_REVIEW",reschedule:"SMS_TEMPLATE_RESCHEDULE"})[type];
  return String((envKey && env[envKey]) || defaults[type] || defaults.confirm);
}
function renderTemplate(env, type, fields, record) {
  const data = {
    "Дата": formatRuDate(dateValue(fields)),
    "Время": timeValue(fields),
    "Имя": fields?.["Имя клиента"] || "",
    "Телефон": fields?.["Телефон"] || "",
    "Компания": fields?.["Компания"] || "",
    "Авто": fields?.["Авто"] || "",
    "Услуга": fields?.["Услуга"] || "",
    "ID": record?.id || fields?.Id || ""
  };
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
  const text = await res.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
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
    const res = await fetch(env.SMS_WEBHOOK_URL, { method:"POST", headers:{"content-type":"application/json", ...(env.SMS_WEBHOOK_TOKEN ? {"authorization": `Bearer ${env.SMS_WEBHOOK_TOKEN}`} : {})}, body:JSON.stringify({ phone, text, type }) });
    const raw = await res.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!res.ok) throw makeError(data.message || data.error || data.raw || "Ошибка SMS webhook", res.status || 502, data);
    return { ok:true, provider:"webhook", id:data.id || data.message_id || "", data };
  }
  const base = String(env.SIGMASMS_API_BASE || "https://online.sigmasms.ru/api").replace(/\/+$/, "");
  const token = await sigmaToken(env);
  const sender = String(env.SIGMASMS_SENDER || env.SMS_SENDER || "SOLNCANET");
  const body = { recipient:[phone], type:"sms", payload:{ sender, text:String(text) } };
  const res = await fetch(`${base}/sendings`, { method:"POST", headers:{"charset":"utf-8", "content-type":"application/json", "authorization": token}, body:JSON.stringify(body) });
  const raw = await res.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!res.ok) throw makeError(data.message || data.error || data.raw || "Ошибка отправки SMS", res.status || 502, data);
  return { ok:true, provider:"sigmasms", id:data.id || data.message_id || data.uuid || "", data };
}
async function sendSmsForRecord(env, record, type, force = false) {
  const fields = record?.fields || {};
  if (!isActiveForSms(fields) && type !== "review") return { ok:false, skipped:true, reason:"Статус не подходит для SMS" };
  const logKey = SMS_KEYS[type] || type;
  const log = smsLogFromFields(fields);
  if (!force && log[logKey]) return { ok:true, skipped:true, reason:"SMS уже отправлена", logKey, sentAt:log[logKey]?.at || log[logKey] };
  const text = renderTemplate(env, type, fields, record);
  const sms = await sendSms(env, fields["Телефон"], text, type);
  if (!sms.ok || sms.skipped) return sms;
  const now = new Date().toISOString();
  const nextLog = { ...log, [logKey]:{ at:now, id:sms.id || "", type } };
  if (record?.id) {
    const updated = writeSmsLog(fields, nextLog);
    await patchRecord(env, record.id, { "Комментарий администратора": updated["Комментарий администратора"] });
  }
  return { ok:true, sms, logKey, text };
}
async function maybeAutoConfirm(env, record) {
  if (String(env.SMS_AUTO_CONFIRM ?? "1") === "0") return { ok:false, skipped:true, reason:"SMS_AUTO_CONFIRM=0" };
  const f = record?.fields || {};
  if (!normalizePhone(f["Телефон"])) return { ok:false, skipped:true, reason:"Нет телефона" };
  if (!dateValue(f)) return { ok:false, skipped:true, reason:"Нет даты" };
  try { return await sendSmsForRecord(env, record, "confirm", false); }
  catch (e) { return { ok:false, error:e.message, details:e.details || null }; }
}
function appointmentUtcMs(fields, env) {
  const d = dateValue(fields); if (!d) return NaN;
  const t = timeValue(fields) || "10:00";
  const dm = d.match(/^(\d{4})-(\d{2})-(\d{2})$/); const tm = t.match(/^(\d{1,2}):(\d{2})/);
  if (!dm || !tm) return NaN;
  const offsetMin = Number(env.SMS_TIMEZONE_OFFSET_MINUTES || 300);
  return Date.UTC(Number(dm[1]), Number(dm[2])-1, Number(dm[3]), Number(tm[1]), Number(tm[2])) - offsetMin*60000;
}

export async function onRequest(context) {
  const o = options(context.request); if (o) return o;
  if (context.request.method !== "POST") return json({ ok:false, error:"Метод не поддерживается" }, 405);
  try {
    checkAdmin(context.request, context.env || {});
    const body = await readBody(context.request);
    const id = body.id || body.Id || body.recordId || body.ID;
    const typeRaw = String(body.type || body.template || "").toLowerCase();
    const typeMap = { "confirm":"confirm", "confirmation":"confirm", "day":"day", "reminder_day":"day", "2h":"two_hours", "two_hours":"two_hours", "reminder_2h":"two_hours", "reschedule":"reschedule", "perenos":"reschedule", "перенос":"reschedule", "review":"review", "отзыв":"review" };
    const type = typeMap[typeRaw] || typeRaw;
    if (!id) return json({ ok:false, error:"Не передан id записи" }, 400);
    if (!Object.values(SMS_KEYS).includes(type)) return json({ ok:false, error:"Неизвестный шаблон SMS: " + typeRaw }, 400);
    const record = await getRecord(context.env, id);
    if (!record) return json({ ok:false, error:"Заявка не найдена" }, 404);
    const result = await sendSmsForRecord(context.env, record, type, Boolean(body.force || type === "reschedule" || type === "review"));
    return json({ ok:result.ok !== false, result, type });
  } catch (e) { return err(e); }
}
