(function(){
  const started = document.getElementById('formStartedAt');
  if (started) started.value = String(Date.now());
  document.querySelectorAll('.floating-contact__main').forEach((btn)=>btn.addEventListener('click',()=>btn.closest('.floating-contact')?.classList.toggle('open')));
  const form = document.getElementById('leadForm');
  if (!form) return;
  const msg = document.getElementById('leadMessage');
  const btn = document.getElementById('leadSubmitBtn');
  const today = () => new Date().toISOString().slice(0,10);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.hpCompany) return;
    if (Number(data.formStartedAt || 0) && Date.now() - Number(data.formStartedAt) < 1200) return;
    const fields = {
      'Имя клиента': (data.name || '').trim(),
      'Компания': (data.companyName || '').trim(),
      'Телефон': (data.phone || '').trim(),
      'Направление': data.direction || 'Авто',
      'Услуга': data.service || 'Заявка с сайта',
      'Дата записи': data.preferredDate || today(),
      'Время записи': data.preferredTime || '10:00',
      'Адрес': data.direction === 'Авто' ? '' : (data.address || '').trim(),
      'Авто': data.direction === 'Авто' ? (data.address || '').trim() : '',
      'Комментарий клиента': (data.task || '').trim(),
      'Статус': 'Новая заявка',
      'Источник': 'Сайт'
    };
    btn.disabled = true;
    btn.textContent = 'Отправляю...';
    msg.className = 'form-message';
    msg.textContent = '';
    try {
      const res = await fetch('/create-zayavka', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fields})});
      const json = await res.json().catch(()=>({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Не удалось отправить заявку');
      msg.className = 'form-message ok';
      msg.textContent = 'Заявка отправлена. Мы свяжемся с вами для уточнения деталей.';
      form.reset();
      if (started) started.value = String(Date.now());
    } catch (e) {
      msg.className = 'form-message bad';
      msg.textContent = e.message || 'Ошибка отправки. Напишите нам в Telegram или MAX.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить заявку';
    }
  });
})();
