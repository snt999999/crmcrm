
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-admin-password,xc-token,idempotency-key"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
}
function options(request) { return request.method === "OPTIONS" ? new Response(null, { status: 204, headers: CORS }) : null; }
async function readBody(request) { const text = await request.text(); if (!text) return {}; try { return JSON.parse(text); } catch { throw makeError("Некорректный JSON", 400); } }
function makeError(message, status = 500, details = null) { const e = new Error(message); e.status = status; e.details = details; return e; }
function err(error) { return json({ ok:false, error:error.message || "Ошибка сервера", details:error.details || null }, Number(error.status || 500)); }
function checkAdmin(request, env) {
  const expected = env.ADMIN_PASSWORD || env.ADMIN_SECRET || "";
  if (!expected) return;
  const got = request.headers.get("x-admin-password") || "";
  if (got !== expected) throw makeError("Нет доступа: неверный ADMIN_PASSWORD", 401);
}
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


export async function onRequest(context) {
  const o = options(context.request); if (o) return o;
  if (context.request.method !== "POST") return json({ ok:false, error:"Метод не поддерживается" }, 405);
  try {
    checkAdmin(context.request, context.env || {});
    const body = await readBody(context.request);
    const operations = Array.isArray(body.operations) ? body.operations.slice(0, 30) : [];
    if (!operations.length) return json({ ok:false, error:"Нет операций" }, 400);
    const results = [];
    for (const [index, op] of operations.entries()) {
      try {
        const type = String(op.type || op.action || "").toLowerCase();
        if (type === "create") {
          const fields = cleanAutoFields(op.fields || op.data || op.record || {});
          const res = await ncFetch(context.env, endpoint(context.env), { method:"POST", headers:headers(context.env), body:JSON.stringify(fields) });
          results.push({ ok:true, index, type, record:normalizeRecord(res.data) });
        } else if (type === "update") {
          if (!op.id) throw makeError("Не передан id", 400);
          const fields = cleanAutoFields(op.fields || op.data || op.record || {});
          const res = await ncFetch(context.env, `${endpoint(context.env)}/${encodeURIComponent(op.id)}`, { method:"PATCH", headers:headers(context.env), body:JSON.stringify(fields) });
          results.push({ ok:true, index, type, record:normalizeRecord(res.data, op.id) });
        } else if (type === "delete" || type === "trash") {
          if (!op.id) throw makeError("Не передан id", 400);
          const now = new Date().toISOString();
          const fields = { "Статус":"Удалена", "DeletedAt":now, "Причина удаления":op.reason || "Удалено пакетно" };
          const res = await ncFetch(context.env, `${endpoint(context.env)}/${encodeURIComponent(op.id)}`, { method:"PATCH", headers:headers(context.env), body:JSON.stringify(fields) });
          results.push({ ok:true, index, type, record:normalizeRecord(res.data, op.id) });
        } else throw makeError("Неизвестная операция: " + type, 400);
      } catch (e) { results.push({ ok:false, index, error:e.message, details:e.details || null }); }
      await sleep(180);
    }
    return json({ ok:results.every(x=>x.ok), results });
  } catch (e) { return err(e); }
}
