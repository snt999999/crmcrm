(function(){
  'use strict';
  const VERSION = 'v71-legacy-full';
  const $ = (id) => document.getElementById(id);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
  const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };
  const WORKERS = ['Сергей','Роман','Никита П','Андрей Ш','Никита К','Дмитрий П','Роман З','Дима','Никита П.','Андрей'];
  const ACCOUNTS = { sergey41:'Сергей', roman41:'Роман', admin:'Админ', solncanet:'Админ' };
  const LS_AUTH = 'solncanet_admin_password_v71';
  const LS_USER = 'solncanet_user_v71';
  const LS_WORKSPACE = 'solncanet_workspace_v71';
  const LS_HISTORY = 'solncanet_history_v71';
  const TRASH_STATUSES = new Set(['удалена','отменена','в корзине','удаление','отказ']);
  const DONE_STATUSES = new Set(['выполнено','оплачено']);
  const SMS_TEMPLATES = {
    confirm:{title:'Подтверждение записи', text:'СОЛНЦАНЕТ: запись оформлена на {Дата} в {Время}.'},
    day:{title:'Напоминание за день', text:'СОЛНЦАНЕТ: напоминаем о записи {Дата} в {Время}.'},
    two_hours:{title:'Напоминание за 2 часа', text:'СОЛНЦАНЕТ: до записи осталось 2 часа.'},
    reschedule:{title:'Перенос записи', text:'СОЛНЦАНЕТ: запись перенесена на {Дата} в {Время}.'},
    review:{title:'Благодарность + отзыв', text:'Спасибо, что выбрали СОЛНЦАНЕТ! Оставьте отзыв: https://clck.su/solncanet'}
  };
  const els = {};
  let records = [];
  let smsQueue = [];
  let current = null;
  let currentClientKey = '';
  let currentSection = 'requests';
  let currentWorkspace = localStorage.getItem(LS_WORKSPACE) || 'all';
  let cal = new Date();
  let selectedDate = today();

  boot();

  function boot(){
    bindEls();
    populateWorkerFilters();
    bindEvents();
    renderTemplates();
    if (localStorage.getItem(LS_AUTH)) showApp();
  }

  function bindEls(){
    const ids = ['loginScreen','app','loginForm','loginPassword','loginMsg','appMsg','logoutBtn','mobileMenuBtn','sidebar','sidebarCloseBtn','sidebarOverlay','workspaceSelect','pageTitle','globalSearchInput','globalSearchResults','topQuickAddBtn','topReportsBtn','topRefreshBtn','quickAddBtn','exportBtn','downloadCsvBtn','requestsBody','trashBody','searchInput','statusFilter','installerFilter','dateFrom','dateTo','clearFiltersBtn','statTotal','statNew','statToday','statVolume','dashTotal','dashToday','dashWork','dashMoney','upcomingCards','problemCards','calendarGrid','monthTitle','calendarMonthSummary','calendarTodayBtn','calendarSelectedDateTitle','calendarSelectedDateSummary','calendarSelectedEvents','prevMonth','nextMonth','clientsBody','clientsSearchInput','clientsDateFrom','clientsDateTo','clientsStatusFilter','clientsClearFiltersBtn','clientsStatCount','clientsStatRequests','clientsStatM2','clientsStatRepeat','objectsBody','objectsSearchInput','objectsDateFrom','objectsDateTo','objectsStatusFilter','objectsInstallerFilter','objectsClearFiltersBtn','objectsStatCount','objectsStatM2','objectsStatDone','objectsStatWork','installersBody','installersSearchInput','installersDateFrom','installersDateTo','installersStatusFilter','installersClearFiltersBtn','installersStatJobs','installersStatM2','installersStatAmount','installersStatTotal','installerDetailsPanel','installerDetailsTitle','installerDetailsInfo','installerDetailsCloseBtn','installerDetailsBody','filesBody','filesSearchInput','filesTypeFilter','historyBody','historySearchInput','clearHistoryLocalBtn','notificationCheckBtn','testNotifyTo','testNotifyMessage','sendTestNotifyBtn','notificationStatus','notificationTemplatesList','smsQueueBody','smsQueueRefreshBtn','smsQueueCronBtn','smsQueueSearch','smsQueueTypeFilter','smsQueueStatusFilter','smsQueueClearBtn','smsStatScheduled','smsStatDue','smsStatSent','smsStatCanceled','calendarImportCheckBtn','calendarImportLoadBtn','calendarImportSearch','calendarImportFrom','calendarImportTo','calendarImportStatus','calendarImportList','downloadReportBtn','reportDateFrom','reportDateTo','reportStatus','reportFormat','reportPreview','healthBtn','runSmsCronBtn','clearCacheBtn','healthResult','quickAddDialog','quickName','quickCompany','quickPhone','quickDirection','quickDate','quickTime','quickResponsible','quickAutoFields','quickAuto','quickAutoServices','quickAddServiceBtn','quickAutoTotal','quickM2','quickFilm','quickAddress','quickService','quickComment','quickSaveBtn','requestDialog','dialogTitle','requestInfo','closeDialogBtn','editDate','editTime','editStatus','editDirection','editName','editPhone','editCompany','editResponsible','editM2','editFilm','editAddress','editService','editAutoFields','editAuto','editAutoServices','editAddServiceBtn','editAutoTotal','editAdminComment','requestHistoryBox','cancelRequestBtn','sendRescheduleSmsBtn','sendReviewSmsBtn','saveRequestBtn','clientCardDialog','clientCardTitle','clientCardSubtitle','clientCardStatRequests','clientCardStatM2','clientCardStatDone','clientCardStatLast','clientCardInfo','clientCardRequestsBody'];
    ids.forEach(id => els[id] = $(id));
    if (els.workspaceSelect) els.workspaceSelect.value = currentWorkspace;
  }

  function bindEvents(){
    on(els.loginForm, 'submit', e => { e.preventDefault(); login((els.loginPassword.value || '').trim()); });
    on(els.logoutBtn, 'click', () => { localStorage.removeItem(LS_AUTH); localStorage.removeItem(LS_USER); location.reload(); });
    on(els.mobileMenuBtn, 'click', () => document.body.classList.add('sidebar-open'));
    on(els.sidebarCloseBtn, 'click', closeSidebar);
    on(els.sidebarOverlay, 'click', closeSidebar);
    on(els.topRefreshBtn, 'click', load);
    on(els.topQuickAddBtn, 'click', openQuickAdd);
    on(els.quickAddBtn, 'click', openQuickAdd);
    on(els.topReportsBtn, 'click', () => setSection('reports'));
    on(els.workspaceSelect, 'change', () => { currentWorkspace = els.workspaceSelect.value || 'all'; localStorage.setItem(LS_WORKSPACE, currentWorkspace); renderAll(); });
    $$('[data-section]').forEach(btn => on(btn, 'click', () => setSection(btn.dataset.section)));
    $$('[data-section-jump]').forEach(btn => on(btn, 'click', () => setSection(btn.dataset.sectionJump)));
    on(els.globalSearchInput, 'input', renderGlobalSearch);
    on(els.globalSearchInput, 'focus', renderGlobalSearch);
    on(els.globalSearchResults, 'click', handleGlobalSearchClick);
    document.addEventListener('click', e => { if (els.globalSearchInput && els.globalSearchResults && !els.globalSearchInput.contains(e.target) && !els.globalSearchResults.contains(e.target)) els.globalSearchResults.hidden = true; });

    [els.searchInput,els.statusFilter,els.installerFilter,els.dateFrom,els.dateTo].forEach(el => { on(el,'input',renderRequests); on(el,'change',renderRequests); });
    on(els.clearFiltersBtn, 'click', () => { [els.searchInput,els.statusFilter,els.installerFilter,els.dateFrom,els.dateTo].forEach(x=>{ if(x) x.value=''; }); renderRequests(); });
    on(els.requestsBody, 'click', handleRowsClick);
    on(els.trashBody, 'click', handleRowsClick);
    on(els.clientsBody, 'click', handleRowsClick);
    on(els.objectsBody, 'click', handleRowsClick);
    on(els.filesBody, 'click', handleRowsClick);
    on(els.clientCardRequestsBody, 'click', handleRowsClick);
    on(els.exportBtn, 'click', () => downloadTable('zayavki-solncanet.xls', filteredRecords(false), 'xls'));
    on(els.downloadCsvBtn, 'click', () => downloadTable('zayavki-solncanet.csv', filteredRecords(false), 'csv'));
    on(els.prevMonth, 'click', () => { cal.setMonth(cal.getMonth()-1); renderCalendar(); });
    on(els.nextMonth, 'click', () => { cal.setMonth(cal.getMonth()+1); renderCalendar(); });
    on(els.calendarTodayBtn, 'click', () => { const n=new Date(); cal = new Date(n.getFullYear(), n.getMonth(), 1); selectedDate = today(); renderCalendar(); });
    on(els.calendarGrid, 'click', e => { const d=e.target.closest('[data-cal-date]')?.dataset.calDate; if (d) { selectedDate=d; renderCalendar(); } });
    [els.clientsSearchInput,els.clientsDateFrom,els.clientsDateTo,els.clientsStatusFilter].forEach(el => { on(el,'input',renderClients); on(el,'change',renderClients); });
    on(els.clientsClearFiltersBtn, 'click', () => { [els.clientsSearchInput,els.clientsDateFrom,els.clientsDateTo,els.clientsStatusFilter].forEach(x=>{if(x)x.value='';}); renderClients(); });
    [els.objectsSearchInput,els.objectsDateFrom,els.objectsDateTo,els.objectsStatusFilter,els.objectsInstallerFilter].forEach(el => { on(el,'input',renderObjects); on(el,'change',renderObjects); });
    on(els.objectsClearFiltersBtn, 'click', () => { [els.objectsSearchInput,els.objectsDateFrom,els.objectsDateTo,els.objectsStatusFilter,els.objectsInstallerFilter].forEach(x=>{if(x)x.value='';}); renderObjects(); });
    [els.installersSearchInput,els.installersDateFrom,els.installersDateTo,els.installersStatusFilter].forEach(el => { on(el,'input',renderInstallers); on(el,'change',renderInstallers); });
    on(els.installersClearFiltersBtn, 'click', () => { [els.installersSearchInput,els.installersDateFrom,els.installersDateTo,els.installersStatusFilter].forEach(x=>{if(x)x.value='';}); renderInstallers(); });
    on(els.installersBody, 'click', e => { const w = e.target.closest('[data-installer]')?.dataset.installer; if(w) openInstaller(w); });
    on(els.installerDetailsCloseBtn, 'click', () => els.installerDetailsPanel?.classList.add('hidden'));
    on(els.filesSearchInput, 'input', renderFiles);
    on(els.filesTypeFilter, 'change', renderFiles);
    on(els.historySearchInput, 'input', renderHistory);
    on(els.clearHistoryLocalBtn, 'click', () => { if(confirm('Очистить локальный журнал истории?')){ localStorage.removeItem(LS_HISTORY); renderHistory(); } });
    on(els.quickDirection, 'change', updateQuickDirectionUi);
    on(els.quickAddServiceBtn, 'click', () => addAutoServiceRow('quick'));
    on(els.quickAutoServices, 'input', () => calcAutoTotal('quick'));
    on(els.quickAutoServices, 'click', e => { if(e.target.closest('[data-remove-auto-row]')){ e.target.closest('.auto-row')?.remove(); calcAutoTotal('quick'); } });
    on(els.quickSaveBtn, 'click', saveQuickAdd);
    on(els.editDirection, 'change', updateEditDirectionUi);
    on(els.editAddServiceBtn, 'click', () => addAutoServiceRow('edit'));
    on(els.editAutoServices, 'input', () => calcAutoTotal('edit'));
    on(els.editAutoServices, 'click', e => { if(e.target.closest('[data-remove-auto-row]')){ e.target.closest('.auto-row')?.remove(); calcAutoTotal('edit'); } });
    on(els.closeDialogBtn, 'click', closeRequestDialog);
    on(els.saveRequestBtn, 'click', saveCurrent);
    on(els.cancelRequestBtn, 'click', trashCurrent);
    on(els.sendRescheduleSmsBtn, 'click', () => sendManualSms('reschedule'));
    on(els.sendReviewSmsBtn, 'click', () => sendManualSms('review'));
    $$('[data-close-dialog]').forEach(btn => on(btn, 'click', () => btn.closest('dialog')?.close()));
    on(els.notificationCheckBtn, 'click', checkHealth);
    on(els.sendTestNotifyBtn, 'click', sendTestSms);
    on(els.smsQueueRefreshBtn, 'click', loadSmsQueue);
    on(els.smsQueueCronBtn, 'click', runSmsCronNow);
    [els.smsQueueSearch, els.smsQueueTypeFilter, els.smsQueueStatusFilter].forEach(el => { on(el,'input',renderSmsQueue); on(el,'change',renderSmsQueue); });
    on(els.smsQueueClearBtn, 'click', () => { [els.smsQueueSearch,els.smsQueueTypeFilter,els.smsQueueStatusFilter].forEach(x=>{if(x)x.value='';}); renderSmsQueue(); });
    on(els.smsQueueBody, 'click', handleSmsQueueClick);
    on(els.calendarImportCheckBtn, 'click', () => { if(els.calendarImportStatus) els.calendarImportStatus.textContent='Раздел готов. Для реального импорта нужна функция calendar-import / google-calendar в Cloudflare.'; });
    on(els.calendarImportLoadBtn, 'click', () => { if(els.calendarImportList) els.calendarImportList.innerHTML='<div class="mini-card"><b>Информационный режим</b><small>Функция импорта календаря не входит в текущую чистую сборку. Старый раздел сохранён в меню, чтобы не потерять структуру.</small></div>'; });
    on(els.downloadReportBtn, 'click', downloadReport);
    [els.reportDateFrom,els.reportDateTo,els.reportStatus,els.reportFormat].forEach(el=>{ on(el,'input',renderReports); on(el,'change',renderReports); });
    on(els.healthBtn, 'click', checkHealth);
    on(els.runSmsCronBtn, 'click', runSmsCronNow);
    on(els.clearCacheBtn, 'click', clearCache);
    document.addEventListener('keydown', e => { if(e.key==='Escape'){ closeSidebar(); [els.requestDialog,els.quickAddDialog,els.clientCardDialog].forEach(d=>{ if(d?.open) d.close(); }); } });
  }

  function login(password){
    if (!ACCOUNTS[password]) { els.loginMsg.textContent='Неверный пароль'; els.loginMsg.className='message bad'; return; }
    localStorage.setItem(LS_AUTH, password); localStorage.setItem(LS_USER, ACCOUNTS[password]); showApp();
  }
  function showApp(){ document.body.classList.add('logged-in'); els.loginScreen?.classList.add('hidden'); els.app?.classList.remove('hidden'); setSection(currentSection); load(); }
  function adminPassword(){ return localStorage.getItem(LS_AUTH) || ''; }
  function closeSidebar(){ document.body.classList.remove('sidebar-open'); }

  async function api(path, options={}){
    const headers = Object.assign({'content-type':'application/json','x-admin-password':adminPassword()}, options.headers||{});
    const res = await fetch(path, Object.assign({}, options, {headers}));
    const data = await res.json().catch(()=>({ raw:true }));
    if (!res.ok || data.ok === false) throw new Error(data.error || data.message || 'Ошибка запроса');
    return data;
  }
  function msg(text, type=''){ if(!els.appMsg) return; els.appMsg.textContent=text||''; els.appMsg.className='message ' + (type||''); }
  async function load(){
    msg('Загружаю данные...', '');
    try{
      const data = await api('/list-zayavka?limit=1000&sort=-Id', {method:'GET'});
      const list = data.list || data.records || data.data || [];
      records = list.map(normalizeRecord).filter(Boolean).sort((a,b)=>String(dateOf(b)).localeCompare(String(dateOf(a))) || Number(b.id||0)-Number(a.id||0));
      msg('Данные загружены: ' + records.length, 'ok');
    }catch(e){ msg(e.message, 'bad'); }
    renderAll();
  }

  function normalizeRecord(item){
    if (!item) return null;
    const raw = item.fields && typeof item.fields === 'object' ? item.fields : item;
    const id = item.id ?? item.Id ?? item.ID ?? item.ncRecordId ?? raw.Id ?? raw.id ?? raw.ID;
    return { id:String(id || ''), fields:Object.assign({}, raw), raw:item };
  }
  function f(r, name, fallback=''){ return r?.fields?.[name] ?? fallback; }
  function norm(v){ return String(v ?? '').toLowerCase().replace(/ё/g,'е').trim(); }
  function e(v){ return String(v ?? '').replace(/[&<>'"]/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s])); }
  function num(v){ return Number(String(v||'').replace(/[^\d.,-]/g,'').replace(',','.')) || 0; }
  function money(v){ return (Number(v)||0).toLocaleString('ru-RU') + ' ₽'; }
  function dateOf(r){ return String(f(r,'Дата записи') || f(r,'Дата') || '').slice(0,10); }
  function timeOf(r){ return String(f(r,'Время записи') || f(r,'Время') || '').slice(0,5); }
  function today(){ const d=new Date(); return d.toISOString().slice(0,10); }
  function formatDate(d){ const s=String(d||''); const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : s; }
  function isAutoFields(fields){ return norm(fields['Направление']).includes('авто') || Boolean(fields['Авто'] || fields['Авто услуги']); }
  function isAutoRecord(r){ return isAutoFields(r?.fields||{}); }
  function directionOf(r){ return isAutoRecord(r) ? 'Авто' : (f(r,'Направление') || 'Архитектура'); }
  function isTrash(r){ const s=norm(f(r,'Статус')); return TRASH_STATUSES.has(s) || s.includes('удален') || s.includes('отмен'); }
  function isDone(r){ const s=norm(f(r,'Статус')); return DONE_STATUSES.has(s) || s.includes('выполн') || s.includes('оплачен'); }
  function parseServices(v){ if(Array.isArray(v)) return v; if(!v) return []; try{ const x=JSON.parse(v); return Array.isArray(x)?x:[]; }catch{return [];} }
  function serviceListText(fields){ const rows=parseServices(fields['Авто услуги']); if(rows.length) return rows.map(x => [x.name||x.service||x.title, x.material?`(${x.material})`:''].filter(Boolean).join(' ')).join('; '); return fields['Услуга'] || ''; }
  function autoSum(fields){ const rows=parseServices(fields['Авто услуги']); if(rows.length) return rows.reduce((s,x)=>s+num(x.price ?? x.sum ?? x.amount),0); return num(fields['Общая стоимость'] || fields['Сумма']); }
  function m2(fields){ return num(fields['м2'] || fields['Итоговый м²'] || fields['Итоговый м2']); }
  function amountOrM2(r){ const fields=r.fields||{}; return isAutoFields(fields) ? money(autoSum(fields)) : ((m2(fields)||'—') + ' м²'); }
  function objectText(fields){ return isAutoFields(fields) ? (fields['Авто'] || 'Авто') : (fields['Адрес'] || 'Архитектура'); }
  function phoneLink(phone){ const p=String(phone||''); return p ? `<a class="phone-link" href="tel:${e(p.replace(/[^\d+]/g,''))}">${e(p)}</a>` : '—'; }
  function splitWorkers(v){ return String(v||'').split(/[,;]+/).map(x=>x.trim()).filter(Boolean); }
  function currentWorkspaceRecords(list=records){ return list.filter(r => currentWorkspace === 'all' || (currentWorkspace === 'auto' ? isAutoRecord(r) : !isAutoRecord(r))); }

  function setSection(next){
    currentSection = next || 'dashboard';
    $$('[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === currentSection));
    $$('.section').forEach(s => s.classList.toggle('active-section', s.id === 'section-' + currentSection));
    if (els.pageTitle) els.pageTitle.textContent = sectionTitle(currentSection);
    closeSidebar();
    renderAll();
    if (currentSection === 'sms') loadSmsQueue();
  }
  function sectionTitle(s){ return ({dashboard:'Главная',requests:'Заявки',calendar:'Календарь',clients:'Клиенты',objects:'Объекты',installers:'Монтажники / ЗП',files:'Файлы',history:'История',notifications:'Уведомления',sms:'SMS очередь',calendarImport:'Импорт календаря',reports:'Отчёты',trash:'Корзина',settings:'Проверка'})[s] || 'CRM'; }
  function renderAll(){ renderDashboard(); renderRequests(); renderTrash(); renderCalendar(); renderClients(); renderObjects(); renderInstallers(); renderFiles(); renderHistory(); renderReports(); }

  function activeRecords(){ return currentWorkspaceRecords(records).filter(r=>!isTrash(r)); }
  function filteredRecords(includeTrash=false){
    const base = currentWorkspaceRecords(records).filter(r => includeTrash ? isTrash(r) : !isTrash(r));
    const q = norm(els.searchInput?.value || ''); const st = els.statusFilter?.value || ''; const worker = els.installerFilter?.value || ''; const from = els.dateFrom?.value || ''; const to = els.dateTo?.value || '';
    return base.filter(r => {
      const fields = r.fields || {}; const d = dateOf(r);
      if(st && String(fields['Статус']||'') !== st) return false;
      if(worker && !splitWorkers(fields['Монтажники'] || fields['Ответственный']).includes(worker)) return false;
      if(from && d && d < from) return false; if(to && d && d > to) return false;
      if(q){ const hay = norm([r.id, fields['Имя клиента'], fields['Компания'], fields['Телефон'], fields['Направление'], fields['Авто'], fields['Адрес'], fields['Услуга'], fields['Комментарий администратора']].join(' ')); if(!hay.includes(q)) return false; }
      return true;
    });
  }

  function renderDashboard(){
    const list = activeRecords(); const t = today();
    setText('dashTotal', list.length); setText('dashToday', list.filter(r=>dateOf(r)===t).length); setText('dashWork', list.filter(r=>norm(f(r,'Статус')).includes('работ')).length);
    const autoDone = list.filter(r=>isAutoRecord(r)&&isDone(r)).reduce((s,r)=>s+autoSum(r.fields),0); setText('dashMoney', money(autoDone));
    const upcoming = list.filter(r=>dateOf(r)>=t).sort((a,b)=>(dateOf(a)+timeOf(a)).localeCompare(dateOf(b)+timeOf(b))).slice(0,6);
    if(els.upcomingCards) els.upcomingCards.innerHTML = upcoming.map(miniCard).join('') || '<div class="empty">Ближайших записей нет</div>';
    const problems = list.filter(r => !f(r,'Телефон') || !dateOf(r) || (!isAutoRecord(r) && !m2(r.fields)) || (isAutoRecord(r) && !parseServices(f(r,'Авто услуги')).length)).slice(0,6);
    if(els.problemCards) els.problemCards.innerHTML = problems.map(r => `<div class="mini-card clickable-row" data-open-row="${e(r.id)}"><b>#${e(r.id)} ${e(f(r,'Имя клиента')||'Без имени')}</b><small>${!f(r,'Телефон')?'нет телефона ':''}${!dateOf(r)?'нет даты ':''}${(!isAutoRecord(r)&&!m2(r.fields))?'нет м² ':''}${(isAutoRecord(r)&&!parseServices(f(r,'Авто услуги')).length)?'нет авто-услуг ':''}</small></div>`).join('') || '<div class="empty">Критичных проблем нет</div>';
  }
  function miniCard(r){ const fields=r.fields||{}; return `<div class="mini-card clickable-row" data-open-row="${e(r.id)}"><b>#${e(r.id)} ${e(f(r,'Имя клиента')||'Без имени')}</b><small>${e(formatDate(dateOf(r)))} ${e(timeOf(r))} · ${e(directionOf(r))} · ${e(serviceListText(fields))}</small><span>${statusHtml(f(r,'Статус'))}</span></div>`; }
  function renderRequests(){
    const list = filteredRecords(false); const all = activeRecords();
    setText('statTotal', list.length); setText('statNew', all.filter(r=>norm(f(r,'Статус')).includes('нов')).length); setText('statToday', all.filter(r=>dateOf(r)===today()).length); setText('statVolume', all.reduce((s,r)=>s+m2(r.fields),0).toFixed(1).replace('.0',''));
    if(!els.requestsBody) return;
    els.requestsBody.innerHTML = list.map(rowHtml).join('') || '<tr><td colspan="11" class="empty">Заявок нет</td></tr>';
  }
  function rowHtml(r){ const fields=r.fields||{}; return `<tr class="clickable-row" data-open-row="${e(r.id)}"><td>#${e(r.id)}</td><td>${e(formatDate(dateOf(r)))}</td><td>${e(timeOf(r)||'—')}</td><td><b>${e(fields['Имя клиента']||'—')}</b><br><small>${e(fields['Компания']||'')}</small></td><td>${phoneLink(fields['Телефон'])}</td><td>${directionHtml(directionOf(r))}</td><td>${e(objectText(fields))}</td><td>${e(serviceListText(fields)||'—')}</td><td><b>${e(amountOrM2(r))}</b></td><td>${statusHtml(fields['Статус'])}</td><td><button class="mini-btn" data-open="${e(r.id)}">Открыть</button></td></tr>`; }
  function renderTrash(){ if(!els.trashBody) return; const list=filteredRecords(true); els.trashBody.innerHTML = list.map(r=>`<tr class="clickable-row" data-open-row="${e(r.id)}"><td>#${e(r.id)}</td><td>${e(formatDate(dateOf(r)))}</td><td>${e(f(r,'Имя клиента')||'—')}</td><td>${phoneLink(f(r,'Телефон'))}</td><td>${e(serviceListText(r.fields)||'—')}</td><td>${statusHtml(f(r,'Статус'))}</td><td><button class="mini-btn" data-restore="${e(r.id)}">Вернуть</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Корзина пустая</td></tr>'; }
  function directionHtml(v){ return `<span class="direction-pill ${norm(v).includes('авто')?'auto':''}">${e(v||'—')}</span>`; }
  function statusHtml(st){ const s=norm(st); let cls=''; if(s.includes('нов')) cls='new'; else if(s.includes('работ')) cls='work'; else if(s.includes('выполн')||s.includes('оплачен')) cls='done'; else if(s.includes('отмен')||s.includes('удален')) cls='cancel'; return `<span class="status-pill ${cls}">${e(st||'—')}</span>`; }

  function renderCalendar(){
    if(!els.calendarGrid) return;
    const y = cal.getFullYear(), m = cal.getMonth();
    const start = new Date(y,m,1); const end = new Date(y,m+1,0); const before = (start.getDay()+6)%7;
    const first = new Date(y,m,1-before);
    if(els.monthTitle) els.monthTitle.textContent = start.toLocaleString('ru-RU',{month:'long',year:'numeric'});
    const list = activeRecords();
    if(els.calendarMonthSummary) els.calendarMonthSummary.textContent = 'Записей в месяце: ' + list.filter(r => dateOf(r).startsWith(`${y}-${String(m+1).padStart(2,'0')}`)).length;
    const cells=[];
    for(let i=0;i<42;i++){ const d=new Date(first); d.setDate(first.getDate()+i); const iso=d.toISOString().slice(0,10); const dayRecords=list.filter(r=>dateOf(r)===iso); cells.push(`<div class="calendar-day ${d.getMonth()!==m?'muted':''} ${iso===selectedDate?'selected':''}" data-cal-date="${iso}"><span class="date-num">${d.getDate()}</span>${dayRecords.length?`<span class="calendar-badge">${dayRecords.length}</span>`:''}${dayRecords.slice(0,2).map(r=>`<small>${e(timeOf(r))} ${e(f(r,'Имя клиента')||'')}</small>`).join('')}</div>`); }
    els.calendarGrid.innerHTML = cells.join('');
    const dayList = list.filter(r=>dateOf(r)===selectedDate).sort((a,b)=>timeOf(a).localeCompare(timeOf(b)));
    setText('calendarSelectedDateTitle', 'День: ' + formatDate(selectedDate)); setText('calendarSelectedDateSummary', 'Записей: ' + dayList.length);
    if(els.calendarSelectedEvents) els.calendarSelectedEvents.innerHTML = dayList.map(miniCard).join('') || '<div class="empty">На этот день записей нет</div>';
  }

  function renderClients(){
    if(!els.clientsBody) return; const q=norm(els.clientsSearchInput?.value||''); const from=els.clientsDateFrom?.value||''; const to=els.clientsDateTo?.value||''; const st=els.clientsStatusFilter?.value||'';
    const list=activeRecords().filter(r=>{ const d=dateOf(r); if(from&&d&&d<from)return false; if(to&&d&&d>to)return false; if(st&&f(r,'Статус')!==st)return false; const hay=norm([f(r,'Имя клиента'),f(r,'Телефон'),f(r,'Компания')].join(' ')); return !q || hay.includes(q); });
    const map=new Map(); list.forEach(r=>{ const key=norm(f(r,'Телефон')||f(r,'Имя клиента')||r.id); if(!map.has(key)) map.set(key,[]); map.get(key).push(r); });
    const groups=[...map.values()].sort((a,b)=>String(dateOf(b[0])).localeCompare(String(dateOf(a[0]))));
    setText('clientsStatCount', groups.length); setText('clientsStatRequests', list.length); setText('clientsStatM2', list.reduce((s,r)=>s+m2(r.fields),0).toFixed(1).replace('.0','')); setText('clientsStatRepeat', groups.filter(g=>g.length>1).length);
    els.clientsBody.innerHTML = groups.map(g=>{ const r=g[0], fields=r.fields||{}; const total = g.reduce((sum,x)=>sum+(isAutoRecord(x)?autoSum(x.fields):m2(x.fields)),0); const latest=[...g].sort((a,b)=>String(dateOf(b)).localeCompare(String(dateOf(a))))[0]; return `<tr class="clickable-row" data-client-key="${e(norm(fields['Телефон']||fields['Имя клиента']))}"><td><b>${e(fields['Имя клиента']||'—')}</b></td><td>${phoneLink(fields['Телефон'])}</td><td>${e(fields['Компания']||'—')}</td><td>${g.length}</td><td>${e(formatDate(dateOf(latest)))}</td><td>${e(String(total.toFixed ? total.toFixed(1).replace('.0','') : total))}</td><td><button class="mini-btn" data-client-key="${e(norm(fields['Телефон']||fields['Имя клиента']))}">Открыть</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Клиентов нет</td></tr>';
  }
  function renderObjects(){
    if(!els.objectsBody) return; const q=norm(els.objectsSearchInput?.value||''); const from=els.objectsDateFrom?.value||''; const to=els.objectsDateTo?.value||''; const st=els.objectsStatusFilter?.value||''; const w=els.objectsInstallerFilter?.value||'';
    const list=activeRecords().filter(r=>{ const d=dateOf(r); if(from&&d&&d<from)return false; if(to&&d&&d>to)return false; if(st&&f(r,'Статус')!==st)return false; if(w&&!splitWorkers(f(r,'Монтажники')||f(r,'Ответственный')).includes(w))return false; const hay=norm([r.id,f(r,'Имя клиента'),f(r,'Авто'),f(r,'Адрес'),f(r,'Услуга')].join(' ')); return !q || hay.includes(q); });
    setText('objectsStatCount', list.length); setText('objectsStatM2', list.reduce((s,r)=>s+m2(r.fields),0).toFixed(1).replace('.0','')); setText('objectsStatDone', list.filter(isDone).length); setText('objectsStatWork', list.filter(r=>norm(f(r,'Статус')).includes('работ')).length);
    els.objectsBody.innerHTML = list.map(r=>`<tr class="clickable-row" data-open-row="${e(r.id)}"><td>#${e(r.id)}</td><td>${e(formatDate(dateOf(r)))}</td><td>${e(f(r,'Имя клиента')||'—')}</td><td>${e(objectText(r.fields))}</td><td>${e(serviceListText(r.fields)||'—')}</td><td>${e(f(r,'Монтажники')||f(r,'Ответственный')||'—')}</td><td>${e(amountOrM2(r))}</td><td>${statusHtml(f(r,'Статус'))}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Объектов нет</td></tr>';
  }
  function renderInstallers(){
    if(!els.installersBody) return; const q=norm(els.installersSearchInput?.value||''); const from=els.installersDateFrom?.value||''; const to=els.installersDateTo?.value||''; const st=els.installersStatusFilter?.value||'';
    const list=activeRecords().filter(r=>{ const d=dateOf(r); if(from&&d&&d<from)return false; if(to&&d&&d>to)return false; if(st&&f(r,'Статус')!==st)return false; return true; });
    const map=new Map(); list.forEach(r=>{ const workers=splitWorkers(f(r,'Монтажники')||f(r,'Ответственный')||'Роман'); workers.forEach(w=>{ if(q && !norm(w).includes(q)) return; const rec=map.get(w)||{worker:w,jobs:0,m2:0,amount:0,rows:[]}; rec.jobs++; rec.m2+=m2(r.fields); rec.amount+=calcPayForRecord(r,w); rec.rows.push(r); map.set(w,rec); }); });
    const rows=[...map.values()].sort((a,b)=>b.amount-a.amount);
    setText('installersStatJobs', list.length); setText('installersStatM2', list.reduce((s,r)=>s+m2(r.fields),0).toFixed(1).replace('.0','')); setText('installersStatAmount', money(rows.reduce((s,x)=>s+x.amount,0))); setText('installersStatTotal', rows.length);
    els.installersBody.innerHTML = rows.map(x=>`<tr><td><b>${e(x.worker)}</b></td><td>${x.jobs}</td><td>${x.m2.toFixed(1).replace('.0','')}</td><td><b>${money(x.amount)}</b></td><td>${money(x.jobs?x.amount/x.jobs:0)}</td><td><button class="mini-btn" data-installer="${e(x.worker)}">Детально</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Нет данных</td></tr>';
  }
  function calcPayForRecord(r, worker){ const fields=r.fields||{}; if(!isDone(r) && !norm(f(r,'Статус')).includes('работ')) return 0; if(isAutoFields(fields)){ const rows=parseServices(fields['Авто услуги']); return rows.reduce((s,x)=>s+autoPay(x),0); } return m2(fields) * 300; }
  function autoPay(x){ const name=norm(x.name||x.service||x.title); const price=num(x.price||x.sum||x.amount); if(name.includes('полос')) return 2000; if(name.includes('лобов')) return 2000; if(name.includes('антиблик')) return 700; return Math.round(price*0.45); }
  function openInstaller(worker){ if(!els.installerDetailsPanel) return; const rows=activeRecords().filter(r=>splitWorkers(f(r,'Монтажники')||f(r,'Ответственный')||'Роман').includes(worker)); els.installerDetailsPanel.classList.remove('hidden'); setText('installerDetailsTitle','Детализация: '+worker); setText('installerDetailsInfo','Работ: '+rows.length+' · начислено: '+money(rows.reduce((s,r)=>s+calcPayForRecord(r,worker),0))); els.installerDetailsBody.innerHTML=rows.map(r=>`<tr class="clickable-row" data-open-row="${e(r.id)}"><td>${e(formatDate(dateOf(r)))}</td><td>${e(f(r,'Имя клиента')||'—')}</td><td>${e(serviceListText(r.fields)||'—')}</td><td>${e(amountOrM2(r))}</td><td>${statusHtml(f(r,'Статус'))}</td></tr>`).join(''); }
  function renderFiles(){ if(!els.filesBody)return; const q=norm(els.filesSearchInput?.value||''); const list=activeRecords().filter(r=>{ const files=String(f(r,'Файлы')||''); if(!files)return false; const hay=norm([files,f(r,'Имя клиента'),f(r,'Адрес'),f(r,'Авто')].join(' ')); return !q||hay.includes(q); }); els.filesBody.innerHTML=list.map(r=>`<tr class="clickable-row" data-open-row="${e(r.id)}"><td>#${e(r.id)}</td><td>${e(f(r,'Имя клиента')||'—')}</td><td>${phoneLink(f(r,'Телефон'))}</td><td>${e(objectText(r.fields))}</td><td>${fileChips(f(r,'Файлы'))}</td><td>${statusHtml(f(r,'Статус'))}</td><td><button class="mini-btn" data-open="${e(r.id)}">Открыть</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Файлов нет</td></tr>'; }
  function fileChips(v){ return String(v||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).map(x=>`<span class="file-chip">${e(x.slice(0,80))}</span>`).join('') || '—'; }
  function renderHistory(){ if(!els.historyBody)return; const q=norm(els.historySearchInput?.value||''); const rows=[]; const local=getLocalHistory(); Object.values(local).flat().forEach(x=>rows.push(x)); activeRecords().forEach(r=>parseHistory(f(r,'История изменений')).forEach(x=>rows.push(Object.assign({id:r.id,client:f(r,'Имя клиента')},x)))); const filtered=rows.filter(x=>!q||norm([x.id,x.client,x.action,x.details].join(' ')).includes(q)).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,200); els.historyBody.innerHTML=filtered.map(x=>`<div class="history-item"><b>${e(x.at||'—')} · #${e(x.id||'')}</b><span>${e(x.client||'')} · ${e(x.action||'')}</span><p>${e(x.details||'')}</p></div>`).join('') || '<div class="empty">Истории пока нет</div>'; }
  function parseHistory(v){ if(!v)return[]; if(Array.isArray(v))return v; try{const x=JSON.parse(v); return Array.isArray(x)?x:[];}catch{return String(v).split('\n').filter(Boolean).map(line=>({at:'',action:'Запись',details:line}));} }
  function getLocalHistory(){ try{return JSON.parse(localStorage.getItem(LS_HISTORY)||'{}')||{};}catch{return{};} }
  function saveHistory(id, action, details){ const all=getLocalHistory(); all[id] ||= []; all[id].unshift({at:new Date().toLocaleString('ru-RU'), id, client: current ? f(current,'Имя клиента') : '', action, details}); all[id]=all[id].slice(0,100); localStorage.setItem(LS_HISTORY, JSON.stringify(all)); }

  function openQuickAdd(){ current=null; if(!els.quickAddDialog) return; clearQuick(); els.quickDirection.value = currentWorkspace === 'architecture' ? 'Архитектура' : 'Авто'; addAutoServiceRow('quick'); updateQuickDirectionUi(); els.quickAddDialog.showModal(); }
  function clearQuick(){ ['quickName','quickPhone','quickCompany','quickDate','quickTime','quickResponsible','quickAuto','quickM2','quickFilm','quickAddress','quickService','quickComment'].forEach(id=>{ if(els[id]) els[id].value=''; }); if(els.quickAutoServices) els.quickAutoServices.innerHTML=''; calcAutoTotal('quick'); }
  function updateQuickDirectionUi(){ applyDirectionUi('quick'); }
  function updateEditDirectionUi(){ applyDirectionUi('edit'); }
  function applyDirectionUi(prefix){ const dir = els[prefix+'Direction']?.value || 'Авто'; const isAuto = dir === 'Авто'; const autoBlock = els[prefix+'AutoFields']; if(autoBlock) autoBlock.classList.toggle('hidden', !isAuto); $$(`#${prefix==='quick'?'quickAddDialog':'requestDialog'} .arch-only`).forEach(x => x.classList.toggle('hidden', isAuto)); if(isAuto){ ['M2','Film','Address','Service'].forEach(k=>{ if(els[prefix+k]) els[prefix+k].value=''; }); } }
  function addAutoServiceRow(prefix, data={}){ const box=els[prefix+'AutoServices']; if(!box)return; const div=document.createElement('div'); div.className='auto-row'; div.innerHTML=`<input data-auto-name placeholder="Услуга" value="${e(data.name||data.service||data.title||'')}"><input data-auto-material placeholder="Материал к услуге" value="${e(data.material||'')}"><input data-auto-price inputmode="decimal" placeholder="Сумма" value="${e(data.price??data.sum??data.amount??'')}"><button class="btn-small red" data-remove-auto-row type="button">×</button>`; box.appendChild(div); calcAutoTotal(prefix); }
  function readAutoServices(prefix){ const box=els[prefix+'AutoServices']; if(!box)return[]; return $$('.auto-row', box).map(row=>({ name:row.querySelector('[data-auto-name]')?.value.trim()||'', material:row.querySelector('[data-auto-material]')?.value.trim()||'', price:String(num(row.querySelector('[data-auto-price]')?.value||'')) })).filter(x=>x.name||x.material||num(x.price)); }
  function calcAutoTotal(prefix){ const total=readAutoServices(prefix).reduce((s,x)=>s+num(x.price),0); const out=els[prefix+'AutoTotal']; if(out) out.textContent=money(total); return total; }
  function collectFields(prefix){
    const isQuick=prefix==='quick'; const dir=els[prefix+'Direction']?.value || 'Авто'; const isAuto=dir==='Авто';
    const fields = { 'Дата записи':els[prefix+'Date']?.value||'', 'Время записи':els[prefix+'Time']?.value||'', 'Статус': isQuick ? 'Новая заявка' : (els.editStatus?.value||'Новая заявка'), 'Направление':dir, 'Имя клиента':els[prefix+'Name']?.value||'', 'Телефон':els[prefix+'Phone']?.value||'', 'Компания':els[prefix+'Company']?.value||'', 'Ответственный':els[prefix+'Responsible']?.value||'', 'Монтажники':els[prefix+'Responsible']?.value||'', 'Комментарий администратора': isQuick ? (els.quickComment?.value||'') : (els.editAdminComment?.value||'') };
    if(isAuto){ const services=readAutoServices(prefix); fields['Авто']=els[prefix+'Auto']?.value||''; fields['Авто услуги']=JSON.stringify(services); fields['Общая стоимость']=String(services.reduce((s,x)=>s+num(x.price),0)); fields['Услуга']=services.map(x=>[x.name,x.material?`(${x.material})`:''].filter(Boolean).join(' ')).join('; '); fields['м2']=''; fields['Итоговый м²']=''; fields['Адрес']=''; fields['Материал']=''; fields['Плёнка']=''; }
    else { fields['Авто']=''; fields['Авто услуги']='[]'; fields['Общая стоимость']=''; fields['м2']=els[prefix+'M2']?.value||''; fields['Итоговый м²']=els[prefix+'M2']?.value||''; fields['Плёнка']=els[prefix+'Film']?.value||''; fields['Материал']=els[prefix+'Film']?.value||''; fields['Адрес']=els[prefix+'Address']?.value||''; fields['Услуга']=els[prefix+'Service']?.value||''; }
    return fields;
  }
  async function saveQuickAdd(){ try{ const fields=collectFields('quick'); const data=await api('/create-zayavka',{method:'POST',body:JSON.stringify({fields})}); const rec=normalizeRecord(data.record||data.data); if(rec) records.unshift(rec); els.quickAddDialog.close(); msg('Заявка создана', 'ok'); renderAll(); }catch(e){ alert(e.message); } }
  function openRequest(id){ const r=records.find(x=>String(x.id)===String(id)); if(!r)return; current=r; const fields=r.fields||{}; setText('dialogTitle', `Заявка #${r.id}`); setText('requestInfo', `${formatDate(dateOf(r))} ${timeOf(r)} · ${directionOf(r)}`); fill('editDate',dateOf(r)); fill('editTime',timeOf(r)); fill('editStatus',fields['Статус']||'Новая заявка'); fill('editDirection',isAutoRecord(r)?'Авто':'Архитектура'); fill('editName',fields['Имя клиента']||''); fill('editPhone',fields['Телефон']||''); fill('editCompany',fields['Компания']||''); fill('editResponsible',fields['Ответственный']||fields['Монтажники']||''); fill('editM2',m2(fields)||''); fill('editFilm',fields['Материал']||fields['Плёнка']||''); fill('editAddress',fields['Адрес']||''); fill('editService',fields['Услуга']||''); fill('editAuto',fields['Авто']||''); fill('editAdminComment',stripSmsLog(fields['Комментарий администратора']||'')); if(els.editAutoServices) els.editAutoServices.innerHTML=''; const services=parseServices(fields['Авто услуги']); (services.length?services:[{}]).forEach(s=>addAutoServiceRow('edit',s)); updateEditDirectionUi(); renderCurrentHistory(); els.requestDialog?.showModal(); }
  function fill(id,value){ if(els[id]) els[id].value=value ?? ''; }
  function closeRequestDialog(){ els.requestDialog?.close(); current=null; }
  function renderCurrentHistory(){ if(!els.requestHistoryBox || !current) return; const local=(getLocalHistory()[current.id]||[]); const hist=[...local,...parseHistory(f(current,'История изменений'))].slice(0,50); els.requestHistoryBox.innerHTML=hist.map(x=>`<div class="history-item"><b>${e(x.at||'—')}</b><span>${e(x.action||'')}</span><p>${e(x.details||'')}</p></div>`).join('')||'<div class="empty">Истории нет</div>'; }
  async function saveCurrent(){ if(!current)return; try{ const fields=collectFields('edit'); const data=await api('/update-zayavka',{method:'POST',body:JSON.stringify({id:current.id, fields})}); const rec=normalizeRecord(data.record||data.data); if(rec){ const i=records.findIndex(x=>x.id===current.id); if(i>=0) records[i]=rec; current=rec; } saveHistory(current.id,'Сохранение','Карточка заявки сохранена'); msg('Заявка сохранена', 'ok'); closeRequestDialog(); await load(); }catch(e){ alert(e.message); } }
  async function trashCurrent(){ if(!current)return; if(!confirm('Переместить заявку в корзину?')) return; try{ await api('/delete-zayavka',{method:'POST',body:JSON.stringify({id:current.id,reason:'Удалено из CRM v71'})}); saveHistory(current.id,'Корзина','Заявка перемещена в корзину'); msg('Заявка перемещена в корзину','ok'); closeRequestDialog(); await load(); }catch(e){ alert(e.message); } }
  async function restoreRecord(id){ const r=records.find(x=>x.id===id); if(!r)return; try{ await api('/update-zayavka',{method:'POST',body:JSON.stringify({id,fields:{'Статус':'Новая заявка'}})}); saveHistory(id,'Восстановление','Заявка возвращена из корзины'); await load(); }catch(e){ alert(e.message); } }
  function handleRowsClick(e){ const restore=e.target.closest('[data-restore]')?.dataset.restore; if(restore) return restoreRecord(restore); const open=e.target.closest('[data-open],[data-open-row]'); if(open){ const id=open.dataset.open||open.dataset.openRow; return openRequest(id); } const client=e.target.closest('[data-client-key]')?.dataset.clientKey; if(client) return openClientCard(client); }
  function openClientCard(key){ currentClientKey=key; const list=activeRecords().filter(r=>norm(f(r,'Телефон')||f(r,'Имя клиента'))===key); const r=list[0]; if(!r)return; setText('clientCardTitle',f(r,'Имя клиента')||'Клиент'); setText('clientCardSubtitle',[f(r,'Телефон'),f(r,'Компания')].filter(Boolean).join(' · ')); setText('clientCardStatRequests',list.length); setText('clientCardStatM2',list.reduce((s,x)=>s+m2(x.fields),0).toFixed(1).replace('.0','')); setText('clientCardStatDone',list.filter(isDone).length); setText('clientCardStatLast',formatDate(list.map(dateOf).sort().pop()||'')); if(els.clientCardInfo) els.clientCardInfo.innerHTML=`<div class="mini-card"><b>${e(f(r,'Имя клиента'))}</b><small>${e(f(r,'Телефон'))} · ${e(f(r,'Компания'))}</small></div>`; if(els.clientCardRequestsBody) els.clientCardRequestsBody.innerHTML=list.map(x=>`<tr><td>#${e(x.id)}</td><td>${e(formatDate(dateOf(x)))}</td><td>${e(serviceListText(x.fields)||'—')}</td><td>${statusHtml(f(x,'Статус'))}</td><td><button class="mini-btn" data-open="${e(x.id)}">Открыть</button></td></tr>`).join(''); els.clientCardDialog?.showModal(); }

  function renderGlobalSearch(){ if(!els.globalSearchResults)return; const q=norm(els.globalSearchInput?.value||''); if(!q){ els.globalSearchResults.hidden=true; return; } const list=activeRecords().filter(r=>norm([r.id,f(r,'Имя клиента'),f(r,'Телефон'),f(r,'Авто'),f(r,'Адрес'),serviceListText(r.fields)].join(' ')).includes(q)).slice(0,10); els.globalSearchResults.innerHTML=list.map(r=>`<div class="search-result" data-open="${e(r.id)}"><b>#${e(r.id)} ${e(f(r,'Имя клиента')||'Без имени')}</b><small>${e(f(r,'Телефон')||'')} · ${e(objectText(r.fields))} · ${e(serviceListText(r.fields))}</small></div>`).join('')||'<div class="empty">Ничего не найдено</div>'; els.globalSearchResults.hidden=false; }
  function handleGlobalSearchClick(e){ const id=e.target.closest('[data-open]')?.dataset.open; if(id){ els.globalSearchResults.hidden=true; openRequest(id); } }
  function populateWorkerFilters(){ ['installerFilter','objectsInstallerFilter'].forEach(id=>{ const sel=$(id); if(!sel)return; const first=sel.innerHTML; sel.innerHTML=first + WORKERS.map(w=>`<option>${e(w)}</option>`).join(''); }); }

  async function sendManualSms(type){ if(!current)return; try{ const data=await api('/send-sms',{method:'POST',body:JSON.stringify({id:current.id,type,force:true})}); alert((data?.result?.skipped?data.result.reason:'SMS отправлено') || 'Готово'); await load(); }catch(e){ alert(e.message); } }
  async function sendTestSms(){ try{ const phone=els.testNotifyTo?.value||''; const text=els.testNotifyMessage?.value||''; await api('/send-sms',{method:'POST',body:JSON.stringify({phone,text,type:'test',force:true})}); setText('notificationStatus','Тестовое SMS отправлено'); }catch(e){ setText('notificationStatus',e.message); } }
  async function loadSmsQueue(){ if(!els.smsQueueBody)return; try{ els.smsQueueBody.innerHTML='<tr><td colspan="8" class="empty">Загружаю SMS-очередь...</td></tr>'; const data=await api('/sms-queue?limit=1000',{method:'GET'}); smsQueue=data.items||[]; renderSmsQueue(); }catch(err){ els.smsQueueBody.innerHTML=`<tr><td colspan="8" class="empty">${e(err.message || 'Ошибка загрузки SMS-очереди')}</td></tr>`; } }
  function renderSmsQueue(){ if(!els.smsQueueBody)return; const q=norm(els.smsQueueSearch?.value||''); const type=els.smsQueueTypeFilter?.value||''; const st=els.smsQueueStatusFilter?.value||''; const list=smsQueue.filter(x=>{ if(type&&x.type!==type)return false; if(st&&x.status!==st)return false; if(q&&!norm([x.recordId,x.client,x.phone,x.typeLabel,x.message].join(' ')).includes(q))return false; return true; }); const stats=smsQueue.reduce((a,x)=>{a[x.status]=(a[x.status]||0)+1;return a;},{}); setText('smsStatScheduled',stats.scheduled||0); setText('smsStatDue',stats.due||0); setText('smsStatSent',stats.sent||0); setText('smsStatCanceled',stats.canceled||0); els.smsQueueBody.innerHTML=list.map(smsRowHtml).join('')||'<tr><td colspan="8" class="empty">Очередь пустая</td></tr>'; }
  function smsRowHtml(x){ const dt=toLocalInput(x.scheduledAt); return `<tr><td><input class="sms-time-input" type="datetime-local" value="${e(dt)}" data-sms-time="${e(x.recordId)}|${e(x.type)}"></td><td><b>${e(x.typeLabel||x.type)}</b><br><small>${e(x.message||'')}</small></td><td>#${e(x.recordId||'')}</td><td>${e(x.client||'—')}</td><td>${phoneLink(x.phone)}</td><td>${e(formatDate(x.appointmentDate||''))} ${e(x.appointmentTime||'')}</td><td><span class="status-pill ${e(x.status)}">${e(x.statusLabel||x.status)}</span></td><td class="sms-actions"><button class="btn-small blue" data-sms-action="reschedule" data-id="${e(x.recordId)}" data-type="${e(x.type)}">Сменить время</button><button class="btn-small blue" data-sms-action="send_now" data-id="${e(x.recordId)}" data-type="${e(x.type)}">Сейчас</button>${x.status==='canceled'?`<button class="btn-small" data-sms-action="restore" data-id="${e(x.recordId)}" data-type="${e(x.type)}">Вернуть</button>`:`<button class="btn-small red" data-sms-action="cancel" data-id="${e(x.recordId)}" data-type="${e(x.type)}">Отменить</button>`}</td></tr>`; }
  function toLocalInput(iso){ if(!iso)return''; const d=new Date(iso); if(isNaN(d))return''; const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
  async function handleSmsQueueClick(e){ const btn=e.target.closest('[data-sms-action]'); if(!btn)return; const action=btn.dataset.smsAction, id=btn.dataset.id, type=btn.dataset.type; const input=Array.from(els.smsQueueBody.querySelectorAll('[data-sms-time]')).find(x => x.dataset.smsTime === id+'|'+type); const body={action,id,type}; if(action==='reschedule') body.scheduledAt=input?.value||''; if(action==='cancel') body.reason='Отменено из CRM'; try{ await api('/sms-queue',{method:'POST',body:JSON.stringify(body)}); await loadSmsQueue(); }catch(err){ alert(err.message); } }
  async function runSmsCronNow(){ try{ const data=await api('/sms-cron',{method:'POST',body:JSON.stringify({manual:true})}); alert('SMS-очередь проверена. Отправлено: '+(data.sent||data.result?.sent||0)); await loadSmsQueue(); }catch(e){ alert(e.message); } }

  function renderTemplates(){ if(!els.notificationTemplatesList)return; els.notificationTemplatesList.innerHTML=Object.values(SMS_TEMPLATES).map(t=>`<div class="template-card"><b>${e(t.title)}</b><p>${e(t.text)}</p></div>`).join(''); }
  async function checkHealth(){ try{ const data=await api('/health',{method:'GET'}); const text='OK: '+JSON.stringify(data).slice(0,600); if(els.healthResult) els.healthResult.textContent=text; if(els.notificationStatus) els.notificationStatus.textContent='Проверка OK'; }catch(e){ if(els.healthResult) els.healthResult.textContent=e.message; if(els.notificationStatus) els.notificationStatus.textContent=e.message; } }
  async function clearCache(){ try{ if('caches' in window){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); } localStorage.removeItem('solncanet_last_cache_hint'); alert('Кеш очищен. Обновите страницу Ctrl+F5.'); }catch(e){ alert(e.message); } }

  function reportList(){ const from=els.reportDateFrom?.value||''; const to=els.reportDateTo?.value||''; const st=els.reportStatus?.value||''; return activeRecords().filter(r=>{const d=dateOf(r); if(from&&d&&d<from)return false; if(to&&d&&d>to)return false; if(st&&f(r,'Статус')!==st)return false; return true;}); }
  function renderReports(){ if(!els.reportPreview)return; const list=reportList(); const auto=list.filter(isAutoRecord); const arch=list.filter(r=>!isAutoRecord(r)); const total=auto.reduce((s,r)=>s+autoSum(r.fields),0); els.reportPreview.innerHTML=`<div class="stat-grid compact"><div class="stat-card"><span>Заявок</span><b>${list.length}</b></div><div class="stat-card"><span>Авто</span><b>${auto.length}</b></div><div class="stat-card"><span>Архитектура м²</span><b>${arch.reduce((s,r)=>s+m2(r.fields),0).toFixed(1).replace('.0','')}</b></div><div class="stat-card"><span>Сумма авто</span><b>${money(total)}</b></div></div>`; }
  function downloadReport(){ const fmt=els.reportFormat?.value||'xls'; downloadTable('otchet-solncanet.'+fmt, reportList(), fmt); }
  function downloadTable(filename, rows, fmt){ const headers=['ID','Дата','Время','Клиент','Телефон','Компания','Направление','Объект','Услуга','м2','Сумма','Статус','Ответственный','Комментарий']; const data=rows.map(r=>{ const fields=r.fields||{}; return [r.id,dateOf(r),timeOf(r),fields['Имя клиента']||'',fields['Телефон']||'',fields['Компания']||'',directionOf(r),objectText(fields),serviceListText(fields),m2(fields),isAutoRecord(r)?autoSum(fields):'',fields['Статус']||'',fields['Ответственный']||fields['Монтажники']||'',stripSmsLog(fields['Комментарий администратора']||'')]; }); if(fmt==='csv') return downloadBlob(filename, [headers,...data].map(row=>row.map(csvCell).join(';')).join('\n'), 'text/csv;charset=utf-8'); const html='<table><thead><tr>'+headers.map(h=>`<th>${e(h)}</th>`).join('')+'</tr></thead><tbody>'+data.map(row=>'<tr>'+row.map(c=>`<td>${e(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table>'; downloadBlob(filename, '\ufeff'+html, 'application/vnd.ms-excel;charset=utf-8'); }
  function csvCell(v){ return '"'+String(v??'').replace(/"/g,'""')+'"'; }
  function downloadBlob(name, content, type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

  function setText(id, text){ const el=els[id] || $(id); if(el) el.textContent = text; }
  function stripSmsLog(text){ return String(text||'').replace(/\n?\[SOLNCANET_SMS_LOG:([^\]]*)\]\s*$/,'').trim(); }
})();
