(() => {
  if (!window.matchMedia('(pointer: coarse)').matches) {
    document.querySelectorAll('.metric, .panel, .template-card, .format-option, .upload-card, .schedule-preview, .campaign-list-item, .account-row').forEach((card) => {
      if (card.querySelector(':scope > .surface-spotlight')) return;
      const spotlight = document.createElement('span');
      spotlight.className = 'surface-spotlight';
      spotlight.setAttribute('aria-hidden', 'true');
      card.classList.add('has-spotlight');
      card.prepend(spotlight);
      card.addEventListener('pointermove', (event) => {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty('--spot-x', `${event.clientX - bounds.left}px`);
        card.style.setProperty('--spot-y', `${event.clientY - bounds.top}px`);
      }, { passive: true });
    });
  }

  const language = () => document.documentElement.lang === "es" ? "es" : "en";
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const dateFormatter = (options) => new Intl.DateTimeFormat(language() === "es" ? "es-MX" : "en-US", options);
  const placeholders = () => document.querySelectorAll("[data-placeholder-en][data-placeholder-es]").forEach((element) => {
    element.placeholder = element.dataset[`placeholder${language() === "es" ? "Es" : "En"}`];
  });
  const sampleValues = () => document.querySelectorAll("[data-value-en][data-value-es]").forEach((element) => {
    const previousDefault = element.dataset.currentDefault;
    if (previousDefault === undefined || element.value === previousDefault) {
      const value = element.dataset[`value${language() === "es" ? "Es" : "En"}`];
      element.value = value;
      element.dataset.currentDefault = value;
    }
  });

  const grid = document.querySelector("#calendar-grid");
  if (grid) {
    const monthLabel = document.querySelector("#month-label");
    const selectedLabel = document.querySelector("#selected-date");
    const eventsContainer = document.querySelector("#day-events");
    const weekdays = { en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], es: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] };
    const events = {
      "2026-11-20": [{ time: "10:00", title: { en: "Review campaign drafts", es: "Revisar borradores de campaña" } }],
      "2026-11-21": [{ time: "13:30", title: { en: "Winter Campaign · content review", es: "Winter Campaign · revisión de contenido" } }],
      "2026-11-24": [{ time: "09:00", title: { en: "Winter Campaign · milestone", es: "Winter Campaign · hito" }, milestone: true }, { time: "15:00", title: { en: "Community story", es: "Historia de comunidad" } }],
      "2026-11-26": [{ time: "11:00", title: { en: "Monthly recap", es: "Resumen mensual" } }],
      "2026-11-28": [{ time: "10:30", title: { en: "Customer spotlight", es: "Enfoque en clientes" } }],
      "2026-11-30": [{ time: "14:00", title: { en: "Campaign check-in", es: "Revisión de campaña" } }]
    };
    const today = new Date();
    const todayKey = dateKey(today);
    let view = new Date(today.getFullYear(), today.getMonth(), 1);
    let selected = todayKey;

    function renderEvents() {
      const date = new Date(`${selected}T12:00:00`);
      selectedLabel.textContent = dateFormatter({ weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date);
      eventsContainer.replaceChildren();
      const items = events[selected] || [];
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "empty-day";
        empty.textContent = language() === "es" ? "No hay actividades de ejemplo para este día." : "No sample activity for this day.";
        eventsContainer.append(empty);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "event-row";
        const time = document.createElement("span");
        time.className = "event-time";
        time.textContent = item.time;
        const chip = document.createElement("i");
        chip.className = `event-chip${item.milestone ? " milestone" : ""}`;
        const title = document.createElement("span");
        title.textContent = item.title[language()];
        row.append(time, chip, title);
        eventsContainer.append(row);
      });
    }

    function render() {
      const lang = language();
      const year = view.getFullYear();
      const month = view.getMonth();
      monthLabel.textContent = dateFormatter({ month: "long", year: "numeric" }).format(view);
      grid.replaceChildren();
      weekdays[lang].forEach((day) => {
        const heading = document.createElement("div");
        heading.className = "weekday";
        heading.setAttribute("role", "columnheader");
        heading.textContent = day;
        grid.append(heading);
      });
      const offset = (new Date(year, month, 1).getDay() + 6) % 7;
      const start = new Date(year, month, 1 - offset);
      const count = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7;
      for (let index = 0; index < count; index += 1) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        const key = dateKey(date);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `date-cell${date.getMonth() !== month ? " outside" : ""}${key === todayKey ? " today-mark" : ""}`;
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-pressed", String(key === selected));
        button.setAttribute("aria-label", dateFormatter({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date));
        const number = document.createElement("span");
        number.className = "date-num";
        number.textContent = String(date.getDate());
        button.append(number);
        if (events[key]) {
          const pills = document.createElement("span");
          pills.className = "event-dots";
          events[key].slice(0, 2).forEach((event) => {
            const pill = document.createElement("span");
            pill.className = `event-pill${event.milestone ? " milestone" : ""}`;
            pill.textContent = event.title[lang];
            pills.append(pill);
          });
          button.append(pills);
        }
        button.addEventListener("click", () => { selected = key; render(); });
        grid.append(button);
      }
      renderEvents();
    }
    document.querySelector("#prev-month").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
    document.querySelector("#next-month").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
    document.querySelector("#today-button").addEventListener("click", () => { view = new Date(today.getFullYear(), today.getMonth(), 1); selected = todayKey; render(); });
    document.addEventListener("goodmarketing:language-change", render);
    render();
  }

  const briefForm = document.querySelector("#brief-form");
  if (briefForm) briefForm.addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelector("#brief-feedback").textContent = language() === "es" ? "Este concepto no guarda los datos del brief." : "This concept does not save brief details.";
  });
  document.querySelectorAll(".connect-button").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("#account-feedback").textContent = language() === "es" ? "La conexión no está activa en esta vista previa; no se conectó ninguna cuenta." : "Connections are not live in this preview; no account was connected.";
  }));
  const templateChoices = [...document.querySelectorAll("[data-template-choice]")];
  const selectedTemplateName = document.querySelector("#template-preview-name");
  const selectedTemplateTone = document.querySelector("#template-preview-tone");
  const selectedTemplateSwatch = document.querySelector("#template-preview-swatch");
  function selectBrandTemplate(button) {
    if (!button || !selectedTemplateName || !selectedTemplateTone || !selectedTemplateSwatch) return;
    templateChoices.forEach((choice) => choice.setAttribute("aria-pressed", String(choice === button)));
    selectedTemplateName.textContent = button.dataset.templateName;
    selectedTemplateTone.textContent = button.dataset[`tone${language() === "es" ? "Es" : "En"}`];
    button.dataset.colors.split(",").forEach((color, index) => selectedTemplateSwatch.style.setProperty(`--template-color-${index + 1}`, color));
  }
  templateChoices.forEach((button) => button.addEventListener("click", () => selectBrandTemplate(button)));
  if (templateChoices.length) selectBrandTemplate(templateChoices.find((button) => button.getAttribute("aria-pressed") === "true"));

  function setFileName(target, files, emptyText) {
    if (!target) return;
    target.textContent = files.length ? [...files].map((file) => file.name).join(", ") : emptyText[language()];
  }
  const fileInputs = [
    ["#color-scheme-file", "#color-scheme-name", { en: "No file selected", es: "Ningún archivo seleccionado" }],
    ["#font-files", "#font-files-name", { en: "No files selected", es: "Ningún archivo seleccionado" }],
    ["#logo-file", "#logo-file-name", { en: "No file selected", es: "Ningún archivo seleccionado" }],
    ["#content-assets", "#content-assets-name", { en: "No files selected", es: "Ningún archivo seleccionado" }]
  ];
  fileInputs.forEach(([inputSelector, nameSelector, emptyText]) => {
    const input = document.querySelector(inputSelector);
    const name = document.querySelector(nameSelector);
    if (!input || !name) return;
    input.addEventListener("change", () => setFileName(name, input.files, emptyText));
    setFileName(name, [], emptyText);
  });
  const logoInput = document.querySelector("#logo-file");
  const logoPreview = document.querySelector("#logo-preview");
  let logoPreviewUrl;
  if (logoInput && logoPreview) logoInput.addEventListener("change", () => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    const file = logoInput.files[0];
    if (!file || !file.type.startsWith("image/")) {
      logoPreview.hidden = true;
      logoPreview.removeAttribute("src");
      return;
    }
    logoPreviewUrl = URL.createObjectURL(file);
    logoPreview.src = logoPreviewUrl;
    logoPreview.alt = language() === "es" ? "Vista previa del logotipo" : "Logo preview";
    logoPreview.hidden = false;
  });

  const campaignForm = document.querySelector("#campaign-form");
  const campaignStages = [...document.querySelectorAll("[data-campaign-stage]")];
  const stepButtons = [...document.querySelectorAll("[data-step-target]")];
  function showCampaignStep(step, moveFocus = true) {
    campaignStages.forEach((stage) => { stage.hidden = stage.dataset.campaignStage !== String(step); });
    stepButtons.forEach((button) => {
      const active = button.dataset.stepTarget === String(step);
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    if (moveFocus) document.querySelector(`#campaign-stage-${step} h2`)?.focus();
    if (step === 2) { renderChannelSummaries(); renderContentPreview(); }
    if (step === 3) { renderChannelSummaries(); renderSchedulePreview(); }
  }
  stepButtons.forEach((button) => button.addEventListener("click", () => showCampaignStep(Number(button.dataset.stepTarget))));
  document.querySelectorAll("[data-next-step]").forEach((button) => button.addEventListener("click", () => showCampaignStep(Number(button.dataset.nextStep))));
  document.querySelectorAll("[data-prev-step]").forEach((button) => button.addEventListener("click", () => showCampaignStep(Number(button.dataset.prevStep))));
  if (campaignForm) campaignForm.addEventListener("submit", (event) => { event.preventDefault(); showCampaignStep(2); });

  const contentTitle = document.querySelector("#content-title");
  const contentCopy = document.querySelector("#content-copy");
  const formatChoices = [...document.querySelectorAll("[data-content-format]")];
  const formatNames = { social: { en: "Social post", es: "Publicación social" }, story: { en: "Story", es: "Historia" }, email: { en: "Email update", es: "Correo electrónico" } };
  let selectedFormat = "social";
  function renderContentPreview() {
    if (!contentTitle || !contentCopy) return;
    document.querySelector("#content-preview-title").textContent = contentTitle.value;
    document.querySelector("#content-preview-copy").textContent = contentCopy.value;
    const format = formatNames[selectedFormat][language()];
    document.querySelectorAll("#content-preview-format, #schedule-preview-format").forEach((element) => { element.textContent = format; });
    const scheduleTitle = document.querySelector("#schedule-preview-title");
    if (scheduleTitle) scheduleTitle.textContent = contentTitle.value;
  }
  formatChoices.forEach((button) => button.addEventListener("click", () => {
    selectedFormat = button.dataset.contentFormat;
    formatChoices.forEach((choice) => choice.setAttribute("aria-pressed", String(choice === button)));
    renderContentPreview();
  }));
  contentTitle?.addEventListener("input", renderContentPreview);
  contentCopy?.addEventListener("input", renderContentPreview);

  function renderChannelSummaries() {
    const selectedChannels = [...document.querySelectorAll("[data-campaign-channel]:checked")].map((input) => input.closest("label")?.querySelector("span")?.textContent.trim()).filter(Boolean);
    ["#content-channel-summary", "#schedule-channel-summary"].forEach((selector) => {
      const container = document.querySelector(selector);
      if (!container) return;
      container.replaceChildren();
      if (!selectedChannels.length) {
        const empty = document.createElement("span");
        empty.className = "channel-empty";
        empty.textContent = language() === "es" ? "No hay canales seleccionados en esta vista previa." : "No channels selected in this preview.";
        container.append(empty);
        return;
      }
      selectedChannels.forEach((name) => {
        const chip = document.createElement("span");
        chip.className = "channel-chip";
        chip.textContent = name;
        container.append(chip);
      });
    });
  }
  document.querySelectorAll("[data-campaign-channel]").forEach((input) => input.addEventListener("change", () => { renderChannelSummaries(); renderContentPreview(); }));

  const scheduleDate = document.querySelector("#schedule-date");
  const scheduleTime = document.querySelector("#schedule-time");
  const timeZone = document.querySelector("#schedule-timezone");
  function renderSchedulePreview() {
    if (!scheduleDate) return;
    const selected = scheduleDate.value ? new Date(`${scheduleDate.value}T12:00:00`) : new Date();
    document.querySelector("#schedule-preview-day").textContent = new Intl.DateTimeFormat(language() === "es" ? "es-MX" : "en-US", { day: "numeric" }).format(selected);
    document.querySelector("#schedule-preview-date-label").textContent = new Intl.DateTimeFormat(language() === "es" ? "es-MX" : "en-US", { dateStyle: "medium" }).format(selected);
    document.querySelector("#schedule-preview-time-label").textContent = `${scheduleTime?.value || "12:00"} · ${timeZone?.value || "America/Mexico_City"}`;
    renderContentPreview();
  }
  if (scheduleDate) {
    const minimum = new Date();
    scheduleDate.min = dateKey(minimum);
    const sampleDate = new Date(minimum.getFullYear(), minimum.getMonth(), minimum.getDate() + 7);
    scheduleDate.value = dateKey(sampleDate);
    scheduleDate.addEventListener("input", renderSchedulePreview);
  }
  scheduleTime?.addEventListener("change", renderSchedulePreview);
  timeZone?.addEventListener("change", renderSchedulePreview);
  document.querySelector("#schedule-preview-button")?.addEventListener("click", () => {
    document.querySelector("#schedule-feedback").textContent = language() === "es" ? "La programación es solo una vista previa. No se guardó ni programó ningún contenido." : "This schedule is preview only. No content was saved or scheduled.";
  });

  placeholders();
  sampleValues();
  document.addEventListener("goodmarketing:language-change", () => {
    placeholders();
    sampleValues();
    const selectedTemplate = templateChoices.find((button) => button.getAttribute("aria-pressed") === "true");
    if (selectedTemplate) selectBrandTemplate(selectedTemplate);
    fileInputs.forEach(([inputSelector, nameSelector, emptyText]) => {
      const input = document.querySelector(inputSelector);
      const name = document.querySelector(nameSelector);
      if (input && name && !input.files.length) setFileName(name, [], emptyText);
    });
    if (logoPreview && !logoPreview.hidden) logoPreview.alt = language() === "es" ? "Vista previa del logotipo" : "Logo preview";
    renderContentPreview();
    renderChannelSummaries();
    renderSchedulePreview();
  });
})();
