(function(){
  'use strict';
  const VERSION = 'v67-sms-auto';
  const $ = (id) => document.getElementById(id);
  const LS_AUTH = 'solncanet_auth_v67';
  const PASSWORDS = new Set(['sergey41','roman41','admin','solncanet']);
  const TRASH = new Set(['удалена','отменена','в корзине','удаление','отказ']);
  let records = [];
  let currentId = null;
  let section = 'requests';

  const els = {
    loginScreen:$('loginScreen'), app:$('app'), loginForm:$('loginForm'), loginPassword:$('loginPassword'), loginMsg:$('loginMsg'), appMsg:$('appMsg'),
    logoutBtn:$('logoutBtn'), refreshBtn:$('refreshBtn'), newBtn:$('newBtn'), requestsBody:$('requestsBody'), trashBody:$('trashBody'), calendarList:$('calendarList'),
    search:$('search'), directionFilter:$('directionFilter'), statusFilter:$('statusFilter'), dateFilter:$('dateFilter'), clearFilters:$('clearFilters'),
    statTotal:$('statTotal'), statNew:$('statNew'), statAuto:$('statAuto'), statM2:$('statM2'),
    dialog:$('requestDialog'), dialogTitle:$('dialogTitle'), dialogSub:$('dialogSub'), closeDialog:$('closeDialog'), saveBtn:$('saveBtn'), deleteBtn:$('deleteBtn'),
    fDate:$('fDate'), fTime:$('fTime'), fStatus:$('fStatus'), fDirection:$('fDirection'), fName:$('fName'), fPhone:$('fPhone'), fResponsible:$('fResponsible'), fCompany:$('fCompany'),
    fM2:$('fM2'), fFilm:$('fFilm'), fAddress:$('fAddress'), fService:$('fService'), fAuto:$('fAuto'), fComment:$('fComment'), autoBlock:$('autoBlock'), autoRows:$('autoRows'), addAutoService:$('addAutoService'), autoTotal:$('autoTotal'),
    downloadXlsBtn:$('downloadXlsBtn'), downloadCsvBtn:$('downloadCsvBtn'), reportFrom:$('reportFrom'), reportTo:$('reportTo'), reportDirection:$('reportDirection'), reportStatus:$('reportStatus'), reportXlsBtn:$('reportXlsBtn'), reportBody:$('reportBody'),
    healthBtn:$('healthBtn'), healthResult:$('healthResult'), runSmsCronBtn:$('runSmsCronBtn'), clearCacheBtn:$('clearCacheBtn'), sendRescheduleSmsBtn:$('sendRescheduleSmsBtn'), sendReviewSmsBtn:$('sendReviewSmsBtn')
  };

  init();

  function init(){
    if (localStorage.getItem(LS_AUTH)) showApp();
    els.loginForm.addEventListener('submit', (e)=>{ e.preventDefault(); login(els.loginPassword.value.trim()); });
    els.logoutBtn.addEventListener('click', ()=>{ localStorage.removeItem(LS_AUTH); location.reload(); });
    els.refreshBtn.addEventListener('click', load);
    els.newBtn.addEventListener('click', () => openRecord(null));
    document.querySelectorAll('[data-section]').forEach(btn=>btn.addEventListener('click',()=>setSection(btn.dataset.section)));
    [els.search,els.directionFilter,els.statusFilter,els.dateFilter].forEach(el=>el.addEventListener('input', render));
    els.clearFilters.addEventListener('click',()=>{els.search.value='';els.directionFilter.value='';els.statusFilter.value='';els.dateFilter.value='';render();});
    els.closeDialog.addEventListener('click', closeDialog);
    els.fDirection.addEventListener('change', applyDirectionUi);
    els.addAutoService.addEventListener('click',()=>addAutoRow());
    els.autoRows.addEventListener('input', calcAutoTotal);
    els.autoRows.addEventListener('click',(e)=>{const btn=e.target.closest('[data-remove-row]'); if(btn){btn.closest('.auto-row')?.remove(); calcAutoTotal();}});
    els.saveBtn.addEventListener('click', saveCurrent);
    els.deleteBtn.addEventListener('click', trashCurrent);
    els.requestsBody.addEventListener('click', handleTableClick);
    els.trashBody.addEventListener('click', handleTableClick);
    els.downloadXlsBtn.addEventListener('click',()=>downloadRows('zayavki-solncanet.xls', filteredRecords(false), 'xls'));
    els.downloadCsvBtn.addEventListener('click',()=>downloadRows('zayavki-solncanet.csv', filteredRecords(false), 'csv'));
    [els.reportFrom,els.reportTo,els.reportDirection,els.reportStatus].forEach(el=>el.addEventListener('input', renderReports));
    els.reportXlsBtn.addEventListener('click',()=>downloadRows('otchet-solncanet.xls', reportRows(), 'xls'));
    els.healthBtn.addEventListener('click', checkHealth);
    els.runSmsCronBtn?.addEventListener('click', runSmsCronNow);
    els.sendRescheduleSmsBtn?.addEventListener('click', ()=>sendManualSms('reschedule'));
    els.sendReviewSmsBtn?.addEventListener('click', ()=>sendManualSms('review'));
    els.clearCacheBtn.addEventListener('click', clearBrowserCache);
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && els.dialog.open) closeDialog(); });
  }

  function login(password){
    if (!PASSWORDS.has(password)) { els.loginMsg.className='message bad'; els.loginMsg.textContent='Неверный пароль'; return; }
    localStorage.setItem(LS_AUTH, password);
    showApp();
  }
  function adminPassword(){ return localStorage.getItem(LS_AUTH) || ''; }
  function showApp(){ els.loginScreen.classList.add('hidden'); els.app.classList.remove('hidden'); load(); }

  async function api(path, options={}){
    const headers = Object.assign({'content-type':'application/json','x-admin-password':adminPassword()}, options.headers||{});
    const res = await fetch(path, Object.assign({}, options, {headers}));
    const data = await res.json().catch(()=>({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || data.message || 'Ошибка запроса');
    return data;
  }

  async function load(){
    msg('Загружаю данные...', '');
    try{
      const data = await api('/list-zayavka?limit=1000&sort=-Id', {method:'GET', headers:{'x-admin-password':adminPassword()}});
      const list = data.list || data.records || data.data || [];
      records = list.map(normalizeRecord).filter(Boolean).sort((a,b)=>String(dateOf(b)).localeCompare(String(dateOf(a))) || Number(b.id||0)-Number(a.id||0));
      msg('Данные загружены: ' + records.length, 'ok');
      render();
    }catch(e){ msg(e.message, 'bad'); render(); }
  }

  function normalizeRecord(item){
    if (!item) return null;
    const raw = item.fields && typeof item.fields === 'object' ? item.fields : item;
    const id = item.id ?? item.Id ?? item.ID ?? item.ncRecordId ?? raw.Id ?? raw.id ?? raw.ID;
    const fields = Object.assign({}, raw);
    return {id:String(id || ''), fields, raw:item};
  }
  function field(r, name, fallback=''){ return (r?.fields?.[name] ?? fallback); }
  function lower(v){ return String(v||'').toLowerCase().replace(/ё/g,'е').trim(); }
  function isAuto(f){ return lower(f['Направление']).includes('авто') || !!f['Авто'] || !!f['Авто услуги']; }
  function isTrash(r){ return TRASH.has(lower(field(r,'Статус'))); }
  function dateOf(r){ return field(r,'Дата записи') || field(r,'Дата') || ''; }
  function money(n){ return (Number(n)||0).toLocaleString('ru-RU') + ' ₽'; }
  function num(v){ return Number(String(v||'').replace(/[^\d.,-]/g,'').replace(',','.')) || 0; }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s])); }
  const SMS_LOG_PATTERN = /\n?\[SOLNCANET_SMS_LOG:([^\]]*)\]\s*$/;
  function stripSmsLog(text){ return String(text || '').replace(SMS_LOG_PATTERN, '').trim(); }
  function smsLogFromText(text){ const m=String(text||'').match(SMS_LOG_PATTERN); if(!m) return {}; try{ const x=JSON.parse(m[1]); return x && typeof x==='object' ? x : {}; }catch{return {};} }
  function appendSmsLog(text, log){ if(!log || !Object.keys(log).length) return stripSmsLog(text); const clean=stripSmsLog(text); const marker=`[SOLNCANET_SMS_LOG:${JSON.stringify(log)}]`; return clean ? `${clean}\n${marker}` : marker; }
  function parseServices(v){
    if (Array.isArray(v)) return v;
    if (!v) return [];
    try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; }
  }
  function autoSum(f){
    const services = parseServices(f['Авто услуги']);
    if (services.length) return services.reduce((s,x)=>s+num(x.price ?? x.sum ?? x.amount),0);
    return num(f['Общая стоимость'] || f['Сумма']);
  }
  function getM2(f){ return num(f['м2'] || f['Итоговый м²'] || f['Итоговый м2']); }

  function setSection(next){
    section = next;
    document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active', b.dataset.section===next));
    ['requests','calendar','reports','trash','settings'].forEach(s=>$('section-'+s).classList.toggle('hidden', s!==next));
    render();
  }

  function filteredRecords(includeTrash=false){
    const q = lower(els.search.value);
    const dir = els.directionFilter.value;
    const st = els.statusFilter.value;
    const dt = els.dateFilter.value;
    return records.filter(r=>{
      if (!includeTrash && isTrash(r)) return false;
      if (includeTrash && !isTrash(r)) return false;
      const f = r.fields;
      if (dir && String(f['Направление']||'') !== dir) return false;
      if (st && String(f['Статус']||'') !== st) return false;
      if (dt && dateOf(r) !== dt) return false;
      if (q) {
        const hay = lower([r.id,f['Имя клиента'],f['Компания'],f['Телефон'],f['Направление'],f['Авто'],f['Адрес'],f['Услуга'],f['Комментарий клиента'],f['Комментарий администратора'],f['Авто услуги']].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function render(){
    renderStats();
    renderRequests();
    renderTrash();
    renderCalendar();
    renderReports();
  }
  function renderStats(){
    const active = records.filter(r=>!isTrash(r));
    els.statTotal.textContent = active.length;
    els.statNew.textContent = active.filter(r=>field(r,'Статус')==='Новая заявка').length;
    els.statAuto.textContent = money(active.filter(r=>isAuto(r.fields)).reduce((s,r)=>s+autoSum(r.fields),0));
    els.statM2.textContent = active.filter(r=>!isAuto(r.fields)).reduce((s,r)=>s+getM2(r.fields),0).toLocaleString('ru-RU');
  }
  function statusHtml(st){ const l=lower(st); const c=l.includes('выполн')||l.includes('оплачен')?'done':(TRASH.has(l)?'cancel':''); return `<span class="status-pill ${c}">${esc(st||'—')}</span>`; }
  function objectHtml(f){ return isAuto(f) ? esc(f['Авто'] || 'Автомобиль не указан') : esc(f['Адрес'] || 'Адрес не указан'); }
  function serviceHtml(f){
    if (isAuto(f)) {
      const items=parseServices(f['Авто услуги']);
      return items.length ? items.map(x=>`${esc(x.name||'Услуга')} ${x.material?`<span class="hint">(${esc(x.material)})</span>`:''}`).join('<br>') : esc(f['Услуга']||'—');
    }
    return esc(f['Услуга']||'—');
  }
  function amountHtml(f){ return isAuto(f) ? money(autoSum(f)) : (getM2(f) ? `${getM2(f).toLocaleString('ru-RU')} м²` : '—'); }
  function renderRequests(){
    const rows = filteredRecords(false);
    els.requestsBody.innerHTML = rows.map(r=>rowHtml(r)).join('') || '<tr><td colspan="10">Заявок нет</td></tr>';
  }
  function rowHtml(r){ const f=r.fields; return `<tr><td>#${esc(r.id)}</td><td>${esc(dateOf(r))}<br><span class="hint">${esc(f['Время записи']||'')}</span></td><td><b>${esc(f['Имя клиента']||'—')}</b><br><span class="hint">${esc(f['Компания']||'')}</span></td><td>${esc(f['Телефон']||'—')}</td><td>${esc(f['Направление']||'—')}</td><td>${objectHtml(f)}</td><td>${serviceHtml(f)}</td><td><b>${amountHtml(f)}</b></td><td>${statusHtml(f['Статус'])}</td><td><div class="btn-row"><button class="btn-small blue" data-open="${esc(r.id)}">Открыть</button><button class="btn-small red" data-trash="${esc(r.id)}">Удалить</button></div></td></tr>`; }
  function renderTrash(){
    const rows = filteredRecords(true);
    els.trashBody.innerHTML = rows.map(r=>{const f=r.fields; return `<tr><td>#${esc(r.id)}</td><td>${esc(dateOf(r))}</td><td>${esc(f['Имя клиента']||'—')}</td><td>${esc(f['Телефон']||'')}</td><td>${serviceHtml(f)}</td><td>${statusHtml(f['Статус'])}</td><td><button class="btn-small blue" data-open="${esc(r.id)}">Открыть</button></td></tr>`}).join('') || '<tr><td colspan="7">Корзина пустая</td></tr>';
  }
  function renderCalendar(){
    const upcoming = records.filter(r=>!isTrash(r) && dateOf(r)).sort((a,b)=>String(dateOf(a)).localeCompare(String(dateOf(b)))).slice(0,24);
    els.calendarList.innerHTML = upcoming.map(r=>{const f=r.fields; return `<div class="card"><h3>${esc(dateOf(r))} ${esc(f['Время записи']||'')}</h3><p><b>${esc(f['Имя клиента']||'—')}</b><br>${esc(f['Телефон']||'')}</p><p>${esc(f['Направление']||'')} · ${objectHtml(f)}</p><button class="btn-small blue" data-open="${esc(r.id)}">Открыть</button></div>`}).join('') || '<p class="hint">Записей нет</p>';
    els.calendarList.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openRecord(b.dataset.open)));
  }
  function reportRows(){
    const from=els.reportFrom.value, to=els.reportTo.value, dir=els.reportDirection.value, st=els.reportStatus.value;
    return records.filter(r=>!isTrash(r)).filter(r=>{const d=dateOf(r),f=r.fields; if(from&&d<from)return false;if(to&&d>to)return false;if(dir&&f['Направление']!==dir)return false;if(st&&f['Статус']!==st)return false;return true;});
  }
  function renderReports(){
    const rows=reportRows();
    const auto=rows.filter(r=>isAuto(r.fields)); const arch=rows.filter(r=>!isAuto(r.fields));
    const done=rows.filter(r=>['Выполнено','Оплачено'].includes(field(r,'Статус')));
    els.reportBody.innerHTML = [
      ['Всего заявок', rows.length], ['Авто заявок', auto.length], ['Архитектура заявок', arch.length], ['Выполнено / оплачено', done.length], ['Сумма авто', money(auto.reduce((s,r)=>s+autoSum(r.fields),0))], ['Итоговый м² архитектура', arch.reduce((s,r)=>s+getM2(r.fields),0).toLocaleString('ru-RU')]
    ].map(([a,b])=>`<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join('');
  }
  function handleTableClick(e){
    const open=e.target.closest('[data-open]'); if(open) return openRecord(open.dataset.open);
    const trash=e.target.closest('[data-trash]'); if(trash) return trashById(trash.dataset.trash);
  }

  function openRecord(id){
    currentId = id ? String(id) : null;
    const r = currentId ? records.find(x=>String(x.id)===currentId) : null;
    const f = r?.fields || {};
    els.dialogTitle.textContent = currentId ? `Заявка #${currentId}` : 'Новая заявка';
    els.dialogSub.textContent = 'Сохраните изменения кнопкой «Сохранить».';
    els.fDate.value = f['Дата записи'] || new Date().toISOString().slice(0,10);
    els.fTime.value = f['Время записи'] || '10:00';
    els.fStatus.value = f['Статус'] || 'Новая заявка';
    els.fDirection.value = isAuto(f) ? 'Авто' : (f['Направление'] || 'Архитектура');
    els.fName.value = f['Имя клиента'] || '';
    els.fPhone.value = f['Телефон'] || '';
    els.fResponsible.value = f['Ответственный'] || f['Монтажники'] || '';
    els.fCompany.value = f['Компания'] || '';
    els.fM2.value = f['м2'] || f['Итоговый м²'] || f['Итоговый м2'] || '';
    els.fFilm.value = f['Плёнка'] || f['Пленка'] || f['Материал'] || '';
    els.fAddress.value = f['Адрес'] || '';
    els.fService.value = f['Услуга'] || '';
    els.fAuto.value = f['Авто'] || '';
    els.fComment.value = stripSmsLog(f['Комментарий администратора'] || f['Комментарий клиента'] || '');
    setAutoRows(parseServices(f['Авто услуги']));
    if (!els.autoRows.children.length) addAutoRow({name: f['Услуга'] && isAuto(f) ? f['Услуга'] : '', material:'', price:f['Общая стоимость']||f['Сумма']||''});
    applyDirectionUi();
    calcAutoTotal();
    els.deleteBtn.classList.toggle('hidden', !currentId);
    els.sendRescheduleSmsBtn?.classList.toggle('hidden', !currentId);
    els.sendReviewSmsBtn?.classList.toggle('hidden', !currentId);
    els.dialog.showModal();
  }
  function closeDialog(){ els.dialog.close(); currentId=null; }
  function applyDirectionUi(){
    const auto = els.fDirection.value === 'Авто';
    document.querySelectorAll('.arch-only').forEach(el=>{
      el.classList.toggle('hidden', auto);
      if (auto) el.querySelectorAll('input,textarea').forEach(i=>i.value='');
    });
    els.autoBlock.classList.toggle('hidden', !auto);
  }
  function addAutoRow(item={}){
    const div=document.createElement('div'); div.className='auto-row';
    div.innerHTML = `<input data-name placeholder="Услуга" value="${esc(item.name||'')}"><input data-material placeholder="Материал" value="${esc(item.material||'')}"><input data-price placeholder="Сумма" inputmode="decimal" value="${esc(item.price||'')}"><button class="btn-small" type="button" data-remove-row>×</button>`;
    els.autoRows.appendChild(div); calcAutoTotal();
  }
  function setAutoRows(items){ els.autoRows.innerHTML=''; (items||[]).forEach(addAutoRow); }
  function getAutoRows(){
    return Array.from(els.autoRows.querySelectorAll('.auto-row')).map(row=>({
      name: row.querySelector('[data-name]')?.value.trim() || '',
      material: row.querySelector('[data-material]')?.value.trim() || '',
      price: String(row.querySelector('[data-price]')?.value || '').replace(/[^\d.,-]/g,'').replace(',','.').trim()
    })).filter(x=>x.name||x.material||x.price);
  }
  function calcAutoTotal(){ const sum=getAutoRows().reduce((s,x)=>s+num(x.price),0); els.autoTotal.textContent=money(sum); return sum; }
  function collectFields(){
    const auto = els.fDirection.value === 'Авто';
    const base = {
      'Дата записи': els.fDate.value || '', 'Время записи': els.fTime.value || '', 'Статус': els.fStatus.value || 'Новая заявка', 'Направление': els.fDirection.value,
      'Имя клиента': els.fName.value.trim(), 'Телефон': els.fPhone.value.trim(), 'Ответственный': els.fResponsible.value.trim(), 'Компания': els.fCompany.value.trim(),
      'Комментарий администратора': appendSmsLog(els.fComment.value.trim(), smsLogFromText((currentId ? records.find(x=>String(x.id)===currentId)?.fields?.['Комментарий администратора'] : '') || ''))
    };
    if (auto) {
      const services=getAutoRows(); const total=services.reduce((s,x)=>s+num(x.price),0);
      return Object.assign(base, {
        'Направление':'Авто', 'Авто': els.fAuto.value.trim(), 'Авто услуги': JSON.stringify(services), 'Общая стоимость': String(total),
        'Услуга': services.map(x=>[x.name, x.material?`(${x.material})`:'', x.price?`${Number(x.price).toLocaleString('ru-RU')} ₽`:'' ].filter(Boolean).join(' ')).join('; '),
        'м2':'', 'Итоговый м²':'', 'Итоговый м2':'', 'Адрес':'', 'Плёнка':'', 'Пленка':'', 'Материал':''
      });
    }
    return Object.assign(base, {'Направление':'Архитектура', 'Услуга':els.fService.value.trim(), 'Адрес':els.fAddress.value.trim(), 'м2':els.fM2.value.trim(), 'Итоговый м²':els.fM2.value.trim(), 'Плёнка':els.fFilm.value.trim(), 'Пленка':els.fFilm.value.trim(), 'Авто':'', 'Авто услуги':'', 'Общая стоимость':''});
  }
  async function saveCurrent(){
    const fields=collectFields();
    if (!fields['Имя клиента'] && !fields['Телефон'] && !fields['Компания']) { msg('Заполните клиента, телефон или компанию', 'bad'); return; }
    els.saveBtn.disabled=true; els.saveBtn.textContent='Сохраняю...';
    try{
      const payload = currentId ? {id:currentId, fields} : {fields};
      const data = await api(currentId ? '/update-zayavka' : '/create-zayavka', {method:'POST', body:JSON.stringify(payload)});
      const rec = normalizeRecord(data.record || data.data || Object.assign({Id:currentId}, fields));
      if (currentId) records = records.map(r=>String(r.id)===currentId ? rec : r); else records.unshift(rec);
      msg('Сохранено', 'ok');
      closeDialog(); await load();
    }catch(e){ msg(e.message, 'bad'); }
    finally{ els.saveBtn.disabled=false; els.saveBtn.textContent='Сохранить'; }
  }
  async function trashCurrent(){ if(currentId) await trashById(currentId); }
  async function trashById(id){
    if (!confirm('Переместить заявку в корзину?')) return;
    try{ await api('/delete-zayavka', {method:'POST', body:JSON.stringify({id, reason:'Удалено из админки v67'})}); msg('Заявка перемещена в корзину', 'ok'); closeDialog(); await load(); }
    catch(e){ msg(e.message, 'bad'); }
  }

  function toTableRows(rows){
    return rows.map(r=>{const f=r.fields; return {ID:r.id, 'Дата':dateOf(r), 'Время':f['Время записи']||'', 'Статус':f['Статус']||'', 'Направление':f['Направление']||'', 'Клиент':f['Имя клиента']||'', 'Компания':f['Компания']||'', 'Телефон':f['Телефон']||'', 'Ответственный':f['Ответственный']||'', 'Авто':f['Авто']||'', 'Адрес':f['Адрес']||'', 'Услуга':f['Услуга']||'', 'Авто услуги':parseServices(f['Авто услуги']).map(x=>`${x.name} / ${x.material} / ${x.price}`).join('; '), 'м2':getM2(f)||'', 'Сумма':isAuto(f)?autoSum(f):(f['Общая стоимость']||''), 'Комментарий':stripSmsLog(f['Комментарий администратора']||f['Комментарий клиента']||'')}; });
  }
  function downloadRows(filename, rows, format){
    const arr=toTableRows(rows); if(!arr.length){msg('Нет строк для выгрузки','bad');return;}
    const keys=Object.keys(arr[0]); let content,type;
    if(format==='csv') { content='\ufeff'+[keys.join(';')].concat(arr.map(o=>keys.map(k=>`"${String(o[k]??'').replace(/"/g,'""')}"`).join(';'))).join('\n'); type='text/csv;charset=utf-8'; }
    else { content='\ufeff<table border="1"><tr>'+keys.map(k=>`<th>${esc(k)}</th>`).join('')+'</tr>'+arr.map(o=>'<tr>'+keys.map(k=>`<td>${esc(o[k])}</td>`).join('')+'</tr>').join('')+'</table>'; type='application/vnd.ms-excel;charset=utf-8'; }
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  async function checkHealth(){
    els.healthResult.className='ok-note'; els.healthResult.textContent='Проверяю...';
    try{ const d=await api('/health',{method:'GET'}); els.healthResult.textContent='OK: Cloudflare Functions работают. NocoDB: '+(d.nocodb || 'проверка не выполнялась')+'. SMS: '+(d.sms || 'не проверялись')+'. Версия: '+VERSION; }
    catch(e){ els.healthResult.className='danger-note'; els.healthResult.textContent='Ошибка проверки: '+e.message; }
  }

  async function sendManualSms(type){
    if (!currentId) { msg('Сначала откройте сохранённую заявку', 'bad'); return; }
    const label = type === 'reschedule' ? 'перенос записи' : 'благодарность с отзывом';
    if (!confirm('Отправить клиенту SMS: ' + label + '?')) return;
    const btn = type === 'reschedule' ? els.sendRescheduleSmsBtn : els.sendReviewSmsBtn;
    const old = btn?.textContent || '';
    if (btn) { btn.disabled = true; btn.textContent = 'Отправляю...'; }
    try{
      const data = await api('/send-sms', {method:'POST', body:JSON.stringify({id:currentId, type, force:true})});
      msg('SMS отправлена: ' + label, 'ok');
      await load();
      const fresh = records.find(x=>String(x.id)===String(currentId));
      if (fresh) els.fComment.value = stripSmsLog(fresh.fields?.['Комментарий администратора'] || fresh.fields?.['Комментарий клиента'] || '');
    }catch(e){ msg('SMS не отправлена: ' + e.message, 'bad'); }
    finally{ if(btn){ btn.disabled=false; btn.textContent=old; } }
  }
  async function runSmsCronNow(){
    els.healthResult.className='ok-note'; els.healthResult.textContent='Проверяю записи и отправляю SMS-напоминания...';
    try{
      const d = await api('/sms-cron', {method:'POST', body:JSON.stringify({source:'admin-button'})});
      els.healthResult.textContent = 'SMS-напоминания: проверено ' + (d.checked || 0) + ', отправлено ' + (d.sent || 0) + '. Автоматический запуск по расписанию делает GitHub Actions.';
      await load();
    }catch(e){ els.healthResult.className='danger-note'; els.healthResult.textContent='Ошибка SMS-напоминаний: '+e.message; }
  }

  async function clearBrowserCache(){
    try{ if('caches' in window){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); } localStorage.removeItem('solncanet_last_cache_notice'); msg('Кеш очищен. Обновите страницу Ctrl+F5.', 'ok'); }
    catch(e){ msg('Не удалось очистить кеш: '+e.message,'bad'); }
  }
  function msg(text, type){ els.appMsg.className='message '+(type||''); els.appMsg.textContent=text||''; }
})();
