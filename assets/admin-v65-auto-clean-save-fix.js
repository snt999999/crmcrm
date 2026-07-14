/* СОЛНЦАНЕТ v65: Авто-поля + чистое сохранение
   Что делает:
   1) направление "Авто" скрывает и очищает "Итоговый м²/м2", "Адрес" и общий верхний материал/плёнку;
   2) общий материал в блоке Авто не отправляет в NocoDB — материал остается только в строках услуг;
   3) перед отправкой /update-zayavka чистит payload для авто, чтобы в базу не уходили лишние поля;
   4) если NocoDB вернул старую/неполную запись, но сервер v64 подтвердил сохранение, подмешивает отправленные поля в ответ,
      чтобы старый admin.js не падал на ложной проверке.
*/
(function () {
  "use strict";

  const VERSION = "v65-auto-clean-save-fix";
  const HIDDEN_ATTR = "data-v64-auto-hidden";

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isAutoValue(value) {
    const v = norm(value);
    return v === "auto" || v === "авто" || v.includes("авто");
  }

  function controls(root) {
    return Array.from((root || document).querySelectorAll("input, textarea, select"));
  }

  function getFieldBox(el) {
    if (!el) return null;
    return el.closest(".form-field, .field, .form-group, .input-group, .control, .crm-field, .modal-field, .request-field, .col, .cell") || el.parentElement;
  }

  function clearField(field) {
    controls(field).forEach((control) => {
      if (control.type === "checkbox" || control.type === "radio") control.checked = false;
      else control.value = "";
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function hideField(field, clear = true) {
    if (!field || field.getAttribute(HIDDEN_ATTR) === "1") return;
    field.setAttribute(HIDDEN_ATTR, "1");
    field.dataset.v64OldDisplay = field.style.display || "";
    if (clear) clearField(field);
    field.style.display = "none";
    field.hidden = true;
  }

  function showField(field) {
    if (!field || field.getAttribute(HIDDEN_ATTR) !== "1") return;
    field.style.display = field.dataset.v64OldDisplay || "";
    field.hidden = false;
    field.removeAttribute(HIDDEN_ATTR);
    delete field.dataset.v64OldDisplay;
  }

  function labelText(label) {
    return norm(label ? label.textContent : "");
  }

  function allLabels(root) {
    return Array.from((root || document).querySelectorAll("label, .label, .form-label, .field-label, .control-label, b, strong"));
  }

  function fieldByExactLabel(root, names) {
    const set = new Set(names.map(norm));
    return allLabels(root).filter((label) => set.has(labelText(label))).map(getFieldBox).filter(Boolean);
  }

  function fieldByLabelStarts(root, names) {
    const starts = names.map(norm);
    return allLabels(root).filter((label) => starts.some((x) => labelText(label).startsWith(x))).map(getFieldBox).filter(Boolean);
  }

  function isAutoDirection(root) {
    const explicit = [
      document.getElementById("editDirection"),
      document.getElementById("quickDirection"),
      root && root.querySelector && root.querySelector('[name="direction"], [name="Направление"], select[id*="Direction"], select[id*="direction"]')
    ].filter(Boolean);
    if (explicit.some((el) => isAutoValue(el.value))) return true;

    const pairs = allLabels(root).map((label) => ({ label, text: labelText(label), field: getFieldBox(label) }));
    for (const item of pairs) {
      if (!item.text.includes("направление")) continue;
      const val = controls(item.field).map((c) => c.value).join(" ");
      if (isAutoValue(val)) return true;
    }
    return false;
  }

  function autoSection(root) {
    const headings = Array.from((root || document).querySelectorAll("h1,h2,h3,h4,legend,b,strong,.section-title,.card-title"));
    const autoHeading = headings.find((h) => norm(h.textContent) === "авто" || norm(h.textContent).startsWith("авто "));
    return autoHeading ? (autoHeading.closest("section, fieldset, .card, .panel, .block, .box, .dialog-section, div") || autoHeading.parentElement) : null;
  }

  function appearsBefore(a, b) {
    if (!a || !b || a === b) return false;
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function hideGeneralAutoMaterial(root) {
    const section = autoSection(root) || root || document;
    const headings = Array.from(section.querySelectorAll("h1,h2,h3,h4,legend,b,strong,.section-title,.card-title"));
    const servicesHeading = headings.find((h) => norm(h.textContent).includes("услуги") && norm(h.textContent).includes("стоим"));
    const fields = [];

    allLabels(section).forEach((label) => {
      const txt = labelText(label);
      if (!(txt === "пленка" || txt === "пленка" || txt === "пленка / материал" || txt === "материал")) return;
      const field = getFieldBox(label);
      if (!field) return;
      // Не трогаем материал внутри строк услуг после заголовка "Услуги и стоимость".
      if (servicesHeading && !appearsBefore(field, servicesHeading)) return;
      fields.push(field);
    });

    controls(section).forEach((control) => {
      const p = norm(control.placeholder || control.getAttribute("aria-label") || control.name || control.id || "");
      if (!p.includes("материал") && !p.includes("плен")) return;
      const field = getFieldBox(control);
      if (!field) return;
      if (servicesHeading && !appearsBefore(field, servicesHeading)) return;
      fields.push(field);
    });

    return Array.from(new Set(fields));
  }

  function applyAutoLayout(root) {
    root = root || document;
    const auto = isAutoDirection(root);
    const fields = [];
    fields.push(...fieldByExactLabel(root, ["Итоговый м²", "Итоговый м2", "Итоговые м²", "Итоговые м2", "Итого м²", "Итого м2"]));
    fields.push(...fieldByLabelStarts(root, ["Адрес", "Адрес объекта"]));
    fields.push(...hideGeneralAutoMaterial(root));
    const unique = Array.from(new Set(fields.filter(Boolean)));

    if (auto) unique.forEach((field) => hideField(field, true));
    else document.querySelectorAll(`[${HIDDEN_ATTR}='1']`).forEach(showField);
  }

  function parseMaybeJson(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function normalizeAutoServices(fields) {
    const items = parseMaybeJson(fields["Авто услуги"]);
    const clean = items.map((x) => ({
      name: String(x?.name || x?.service || x?.title || "").trim(),
      material: String(x?.material || "").trim(),
      price: String(x?.price || x?.sum || x?.amount || "").replace(/[^\d.,-]/g, "").replace(",", ".").trim()
    })).filter((x) => x.name || x.material || x.price);
    fields["Авто услуги"] = JSON.stringify(clean);
    fields["Общая стоимость"] = String(clean.reduce((sum, x) => sum + (Number(x.price) || 0), 0));
    if (clean.length) {
      fields["Услуга"] = clean.map((x) => [x.name, x.material ? `(${x.material})` : "", x.price ? `${Number(x.price).toLocaleString("ru-RU")} ₽` : ""].filter(Boolean).join(" ")).join("; ");
    }
  }

  function cleanAutoFields(fields) {
    if (!fields || typeof fields !== "object") return fields;
    const direction = fields["Направление"] || fields["Тип направления"] || fields["Категория"] || "";
    const isAuto = isAutoValue(direction) || fields["Авто"] || fields["Авто услуги"];
    if (!isAuto) return fields;

    fields["Направление"] = "Авто";
    fields["Итоговый м2"] = "";
    fields["Итоговый м²"] = "";
    fields["м2"] = "";
    fields["Адрес"] = "";
    // Общий материал/плёнка больше не используется. Материал хранится в каждой строке "Авто услуги".
    fields["Пленка"] = "";
    fields["Плёнка"] = "";
    normalizeAutoServices(fields);
    return fields;
  }

  function cloneJsonResponse(data, init) {
    return new Response(JSON.stringify(data), {
      status: init?.status || 200,
      statusText: init?.statusText || "OK",
      headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, init?.headers || {})
    });
  }

  function installFetchPatch() {
    if (window.__SOLNCANET_V65_FETCH_PATCHED__) return;
    window.__SOLNCANET_V65_FETCH_PATCHED__ = true;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function patchedFetch(input, init) {
      const url = typeof input === "string" ? input : input?.url || "";
      const isUpdate = /\/update-zayavka(?:\?|$)/.test(url);
      let submittedFields = null;

      if (isUpdate && init && init.body) {
        try {
          const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
          if (body && body.fields) {
            cleanAutoFields(body.fields);
            submittedFields = { ...body.fields };
            init = { ...init, body: JSON.stringify(body) };
          }
        } catch (_) {}
      }

      const response = await originalFetch(input, init);
      if (!isUpdate || !submittedFields) return response;

      const copy = response.clone();
      let data = null;
      try { data = await copy.json(); } catch (_) { return response; }
      if (!data || data.ok === false) return response;

      const record = data.record || data.data || data.item || null;
      if (record) {
        record.fields = { ...(record.fields || {}), ...submittedFields };
        if (data.record) data.record = record;
        else if (data.data) data.data = record;
        else data.record = record;
      } else {
        data.record = { id: data.id || "", fields: submittedFields };
      }
      return cloneJsonResponse(data, { status: response.status, statusText: response.statusText });
    };
  }

  function install() {
    const run = () => applyAutoLayout(document);
    document.addEventListener("change", () => setTimeout(run, 0), true);
    document.addEventListener("input", () => setTimeout(run, 0), true);
    const observer = new MutationObserver(() => {
      clearTimeout(install._timer);
      install._timer = setTimeout(run, 80);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "style", "class", "value"] });
    installFetchPatch();
    run();
    window.SOLNCANET_V65 = window.SOLNCANET_V65 || {};
    window.SOLNCANET_V65.autoCleanSaveFix = { version: VERSION, apply: applyAutoLayout, cleanAutoFields };
    console.info("СОЛНЦАНЕТ", VERSION, "installed");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
