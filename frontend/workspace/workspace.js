window.GMPostPreview = (() => {
  const ratios = {
    facebook: { image: 1, video: 16 / 9 },
    instagram: { image: 4 / 5, video: 9 / 16 },
  };
  const observers = new WeakMap();

  function resize(frame) {
    const ratio = ratios[frame.dataset.platformKind]?.[frame.dataset.mediaType];
    if (!ratio) return;
    const hostWidth = frame.parentElement?.getBoundingClientRect().width || frame.getBoundingClientRect().width;
    if (!hostWidth) return;
    const width = Math.min(hostWidth, 320 * ratio);
    frame.style.aspectRatio = `${ratio}`;
    frame.style.width = `${width}px`;
    frame.style.height = `${width / ratio}px`;
  }

  function apply(frame, media, platform, mediaType) {
    frame.dataset.platformKind = platform;
    frame.dataset.mediaType = mediaType;
    media.dataset.platformKind = platform;
    media.dataset.mediaType = mediaType;
    const host = frame.parentElement;
    resize(frame);
    if (host && window.ResizeObserver && !observers.has(frame)) {
      const observer = new ResizeObserver(() => resize(frame));
      observer.observe(host);
      observers.set(frame, observer);
    } else if (!window.ResizeObserver && !observers.has(frame)) {
      const onResize = () => resize(frame);
      window.addEventListener("resize", onResize, { passive: true });
      observers.set(frame, { disconnect: () => window.removeEventListener("resize", onResize) });
    }
  }

  return { apply };
})();

(() => {
  if (window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) {
    document.querySelectorAll('.metric, .panel, .template-card, .format-option, .upload-card, .schedule-preview, .campaign-list-item, .account-row').forEach((card) => {
      if (card.querySelector(':scope > .surface-spotlight')) return;
      const spotlight = document.createElement('span');
      spotlight.className = 'surface-spotlight';
      spotlight.setAttribute('aria-hidden', 'true');
      card.classList.add('has-spotlight');
      card.prepend(spotlight);
      let frame = 0;
      let clientX = 0;
      let clientY = 0;
      card.addEventListener('pointermove', (event) => {
        clientX = event.clientX;
        clientY = event.clientY;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const bounds = card.getBoundingClientRect();
          card.style.setProperty('--mouse-x', `${clientX - bounds.left}px`);
          card.style.setProperty('--mouse-y', `${clientY - bounds.top}px`);
        });
      }, { passive: true });
      card.addEventListener('pointerleave', () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        card.style.removeProperty('--mouse-x');
        card.style.removeProperty('--mouse-y');
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
      "2026-11-20": [{ time: "10:00", type: "content", status: "posted", title: { en: "First look: Leopold", es: "Primer vistazo: Leopold" }, platforms: [
        { name: "Instagram", kind: "instagram", status: "posted", mediaType: "image", src: "/workspace/assets/calendar/leopold-analog-1.jpg", alt: { en: "Leopold analog watch with a digital date and battery display", es: "Reloj analógico Leopold con pantalla digital de fecha y batería" }, caption: { en: "Introducing Leopold: an analog watch designed around the details that matter. OCT 26 · 85%.", es: "Te presentamos Leopold: un reloj analógico diseñado alrededor de los detalles que importan. OCT 26 · 85%." } },
        { name: "Facebook", kind: "facebook", status: "posted", mediaType: "image", src: "/workspace/assets/calendar/leopold-analog-1.jpg", alt: { en: "Leopold analog watch with a digital date and battery display", es: "Reloj analógico Leopold con pantalla digital de fecha y batería" }, caption: { en: "Meet Leopold. A bold analog design with a subtle digital readout for everyday life.", es: "Conoce Leopold. Un diseño analógico distintivo con una discreta lectura digital para todos los días." } }
      ] }],
      "2026-11-21": [{ time: "13:30", type: "content", status: "scheduled", title: { en: "Inside the movement", es: "El movimiento por dentro" }, platforms: [
        { name: "Instagram", kind: "instagram", status: "scheduled", mediaType: "video", src: "/workspace/assets/calendar/leopold-mechanics.mp4", poster: "/workspace/assets/calendar/leopold-mechanics-poster.png", alt: { en: "Leopold watch mechanism turning in close-up", es: "Mecanismo del reloj Leopold en movimiento, en primer plano" }, caption: { en: "Precision in motion. Take a closer look at the mechanics behind Leopold.", es: "Precisión en movimiento. Mira de cerca la mecánica detrás de Leopold." } },
        { name: "Facebook", kind: "facebook", status: "scheduled", mediaType: "video", src: "/workspace/assets/calendar/leopold-mechanics.mp4", poster: "/workspace/assets/calendar/leopold-mechanics-poster.png", alt: { en: "Leopold watch mechanism turning in close-up", es: "Mecanismo del reloj Leopold en movimiento, en primer plano" }, caption: { en: "A closer look at the movement and craft behind the Leopold analog watch.", es: "Un vistazo más cercano al movimiento y la elaboración del reloj analógico Leopold." } }
      ] }],
      "2026-11-24": [{ time: "09:00", title: { en: "Leopold campaign milestone", es: "Hito de la campaña Leopold" }, milestone: true }, { time: "15:00", type: "content", status: "scheduled", title: { en: "Readability, reimagined", es: "Legibilidad renovada" }, platforms: [
        { name: "Instagram", kind: "instagram", status: "scheduled", mediaType: "image", src: "/workspace/assets/calendar/leopold-analog-2.jpg", alt: { en: "Leopold watch face with a full set of analog hour markers", es: "Esfera del reloj Leopold con marcadores analógicos para cada hora" }, caption: { en: "A clearer way to read time. Leopold brings considered markers to a clean analog face.", es: "Una forma más clara de leer la hora. Leopold suma marcadores bien pensados a una esfera analógica limpia." } },
        { name: "Facebook", kind: "facebook", status: "scheduled", mediaType: "image", src: "/workspace/assets/calendar/leopold-analog-2.jpg", alt: { en: "Leopold watch face with a full set of analog hour markers", es: "Esfera del reloj Leopold con marcadores analógicos para cada hora" }, caption: { en: "Designed for a quick glance and a closer look: meet the refined Leopold dial.", es: "Diseñado para verse de un vistazo y apreciarse de cerca: conoce la refinada esfera Leopold." } }
      ] }],
      "2026-11-26": [{ time: "11:00", type: "content", status: "scheduled", title: { en: "Gold-hour details", es: "Detalles en tono dorado" }, platforms: [
        { name: "Instagram", kind: "instagram", status: "scheduled", mediaType: "image", src: "/workspace/assets/calendar/leopold-analog-3.jpg", alt: { en: "Leopold analog watch with gold accents around the dial", es: "Reloj analógico Leopold con detalles dorados alrededor de la esfera" }, caption: { en: "A little brilliance in every hour. Discover the Leopold dial with golden details.", es: "Un destello en cada hora. Descubre la esfera Leopold con detalles dorados." } },
        { name: "Facebook", kind: "facebook", status: "scheduled", mediaType: "image", src: "/workspace/assets/calendar/leopold-analog-3.jpg", alt: { en: "Leopold analog watch with gold accents around the dial", es: "Reloj analógico Leopold con detalles dorados alrededor de la esfera" }, caption: { en: "The finishing touch: warm gold markers meet Leopold’s signature analog design.", es: "El toque final: marcadores dorados se unen al diseño analógico distintivo de Leopold." } }
      ] }],
      "2026-11-30": [{ time: "14:00", title: { en: "Campaign check-in", es: "Revisión de campaña" } }]
    };
    const today = new Date();
    const todayKey = dateKey(today);
    let view = new Date(today.getFullYear(), today.getMonth(), 1);
    let selected = todayKey;
    let focused = todayKey;
    let viewMode = "week";

    const statusText = {
      en: { posted: "Posted", scheduled: "Scheduled", content: "Post preview", video: "Play video" },
      es: { posted: "Publicado", scheduled: "Programado", content: "Vista previa", video: "Reproducir video" }
    };

    function selectedDate() { return new Date(`${selected}T12:00:00`); }
    function focusedDate() { return new Date(`${focused}T12:00:00`); }
    function startOfWeek(date) {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return start;
    }

    function renderEvents() {
      const date = new Date(`${selected}T12:00:00`);
      selectedLabel.textContent = dateFormatter({ weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date);
      eventsContainer.replaceChildren();
      const items = events[selected] || [];
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "empty-day";
        empty.textContent = language() === "es" ? "No hay contenido ni actividad para este día." : "No content or activity for this day.";
        eventsContainer.append(empty);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = `event-row${item.type === "content" ? " content-event" : ""}${item.status === "posted" ? " posted-event" : ""}`;
        const time = document.createElement("span");
        time.className = "event-time";
        time.textContent = item.time;
        const chip = document.createElement("i");
        chip.className = `event-chip${item.milestone ? " milestone" : item.status === "posted" ? " posted" : ""}`;
        const details = document.createElement("div");
        details.className = "event-details";
        const titleLine = document.createElement("div");
        titleLine.className = "event-title-line";
        const title = document.createElement("strong");
        title.className = "event-title";
        title.textContent = item.title[language()];
        titleLine.append(title);
        if (item.status && !item.platforms) {
          const status = document.createElement("span");
          status.className = `event-status ${item.status}`;
          status.textContent = statusText[language()][item.status];
          titleLine.append(status);
        }
        details.append(titleLine);
        if (item.platforms) {
          const platformGrid = document.createElement("div");
          platformGrid.className = "platform-post-grid";
          item.platforms.forEach((platform) => {
            const card = document.createElement("article");
            card.className = "platform-post-card";
            const cardHeading = document.createElement("div");
            cardHeading.className = "platform-post-heading";
            const platformLabel = document.createElement("strong");
            platformLabel.className = `platform-post-name ${platform.kind}`;
            const platformIcon = document.createElement("span");
            platformIcon.setAttribute("aria-hidden", "true");
            platformIcon.textContent = platform.kind === "instagram" ? "◎" : "f";
            platformLabel.append(platformIcon, document.createTextNode(platform.name));
            const platformStatus = document.createElement("span");
            platformStatus.className = `event-status ${platform.status}`;
            platformStatus.textContent = statusText[language()][platform.status];
            cardHeading.append(platformLabel, platformStatus);

            const media = platform.mediaType === "video" ? document.createElement("video") : document.createElement("img");
            const mediaFrame = document.createElement("div");
            mediaFrame.className = "platform-post-media-frame";
            media.className = "platform-post-media";
            media.setAttribute("aria-label", platform.alt[language()]);
            if (platform.mediaType === "video") {
              media.controls = true;
              media.preload = "none";
              media.playsInline = true;
              media.poster = platform.poster;
              const source = document.createElement("source");
              source.src = platform.src;
              source.type = "video/mp4";
              media.append(source);
            } else {
              media.src = platform.src;
              media.alt = platform.alt[language()];
              media.loading = "lazy";
            }

            const caption = document.createElement("p");
            caption.className = "platform-post-caption";
            caption.textContent = platform.caption[language()];
            mediaFrame.append(media);
            card.append(cardHeading, mediaFrame, caption);
            if (window.GMPostPreview) window.GMPostPreview.apply(mediaFrame, media, platform.kind, platform.mediaType);
            platformGrid.append(card);
          });
          details.append(platformGrid);
        }
        row.append(time, chip, details);
        eventsContainer.append(row);
      });
    }

    function render(restoreDateFocus = false) {
      const shouldRestoreDateFocus = restoreDateFocus || grid.contains(document.activeElement);
      const lang = language();
      const year = view.getFullYear();
      const month = view.getMonth();
      const activeWeekStart = startOfWeek(focusedDate());
      if (viewMode === "month") {
        monthLabel.textContent = dateFormatter({ month: "long", year: "numeric" }).format(view);
      } else {
        const endOfWeek = new Date(activeWeekStart.getFullYear(), activeWeekStart.getMonth(), activeWeekStart.getDate() + 6);
        const shortDate = new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" });
        const fullDate = new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric", year: "numeric" });
        monthLabel.textContent = `${shortDate.format(activeWeekStart)} – ${fullDate.format(endOfWeek)}`;
      }
      document.querySelector("#month-view").setAttribute("aria-pressed", String(viewMode === "month"));
      document.querySelector("#week-view").setAttribute("aria-pressed", String(viewMode === "week"));
      grid.replaceChildren();
      const headingRow = document.createElement("div");
      headingRow.className = "calendar-row calendar-heading-row";
      headingRow.setAttribute("role", "row");
      weekdays[lang].forEach((day) => {
        const heading = document.createElement("div");
        heading.className = "weekday";
        heading.setAttribute("role", "columnheader");
        heading.textContent = day;
        headingRow.append(heading);
      });
      grid.append(headingRow);
      const offset = (new Date(year, month, 1).getDay() + 6) % 7;
      const start = viewMode === "week" ? activeWeekStart : new Date(view.getFullYear(), view.getMonth(), 1 - offset);
      const count = viewMode === "week" ? 7 : Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7;
      grid.setAttribute("aria-rowcount", String(1 + count / 7));
      grid.setAttribute("aria-colcount", "7");
      let dateRow;
      for (let index = 0; index < count; index += 1) {
        if (index % 7 === 0) {
          dateRow = document.createElement("div");
          dateRow.className = "calendar-row calendar-date-row";
          dateRow.setAttribute("role", "row");
          grid.append(dateRow);
        }
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        const key = dateKey(date);
        const button = document.createElement("button");
        button.type = "button";
        const dayItems = events[key] || [];
        const hasPosted = dayItems.some((item) => item.status === "posted");
        button.className = `date-cell${viewMode === "month" && date.getMonth() !== month ? " outside" : ""}${key === selected ? " is-selected" : ""}${key === todayKey ? " today-mark" : ""}${hasPosted ? " has-posted" : ""}`;
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-selected", String(key === selected));
        if (key === todayKey) button.setAttribute("aria-current", "date");
        button.tabIndex = key === focused ? 0 : -1;
        button.dataset.dateKey = key;
        const dateLabel = dateFormatter({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
        const postedCount = dayItems.filter((item) => item.status === "posted").length;
        const scheduledCount = dayItems.filter((item) => item.status === "scheduled").length;
        const contentStatus = lang === "es"
          ? [postedCount && `${postedCount} publicado${postedCount === 1 ? "" : "s"}`, scheduledCount && `${scheduledCount} programado${scheduledCount === 1 ? "" : "s"}`].filter(Boolean).join(", ")
          : [postedCount && `${postedCount} posted`, scheduledCount && `${scheduledCount} scheduled`].filter(Boolean).join(", ");
        const todayLabel = key === todayKey ? (lang === "es" ? "hoy" : "today") : "";
        button.setAttribute("aria-label", [dateLabel, todayLabel, contentStatus].filter(Boolean).join(", "));
        const number = document.createElement("span");
        number.className = "date-num";
        number.textContent = String(date.getDate());
        button.append(number);
        if (events[key]) {
          const pills = document.createElement("span");
          pills.className = "event-dots";
          events[key].slice(0, 2).forEach((event) => {
            const pill = document.createElement("span");
            pill.className = `event-pill${event.milestone ? " milestone" : event.status === "posted" ? " posted" : ""}`;
            const platformNames = event.platforms?.map((platform) => platform.name).join(" + ");
            pill.textContent = event.type === "content" ? `${event.status === "posted" ? "✓ " : ""}${platformNames} · ${event.title[lang]}` : event.title[lang];
            pills.append(pill);
          });
          button.append(pills);
        }
        button.addEventListener("click", () => {
          selected = key;
          focused = key;
          if (viewMode === "month" && (date.getMonth() !== month || date.getFullYear() !== year)) view = new Date(date.getFullYear(), date.getMonth(), 1);
          render(true);
        });
        dateRow.append(button);
      }
      renderEvents();
      if (shouldRestoreDateFocus) grid.querySelector(`[data-date-key="${focused}"]`)?.focus();
    }

    grid.addEventListener("keydown", (event) => {
      const cell = event.target.closest('[role="gridcell"][data-date-key]');
      if (!cell) return;
      const dayOffset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (dayOffset === undefined) return;
      event.preventDefault();
      const date = new Date(`${cell.dataset.dateKey}T12:00:00`);
      date.setDate(date.getDate() + dayOffset);
      focused = dateKey(date);
      if (viewMode === "month" && (date.getMonth() !== view.getMonth() || date.getFullYear() !== view.getFullYear())) {
        view = new Date(date.getFullYear(), date.getMonth(), 1);
      }
      render(true);
    });
    document.querySelector("#prev-month").addEventListener("click", () => {
      if (viewMode === "week") selected = dateKey(new Date(selectedDate().getFullYear(), selectedDate().getMonth(), selectedDate().getDate() - 7));
      else { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); selected = dateKey(view); }
      focused = selected;
      render();
    });
    document.querySelector("#next-month").addEventListener("click", () => {
      if (viewMode === "week") selected = dateKey(new Date(selectedDate().getFullYear(), selectedDate().getMonth(), selectedDate().getDate() + 7));
      else { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); selected = dateKey(view); }
      focused = selected;
      render();
    });
    document.querySelector("#today-button").addEventListener("click", () => { view = new Date(today.getFullYear(), today.getMonth(), 1); selected = todayKey; focused = todayKey; render(); });
    document.querySelector("#month-view").addEventListener("click", () => { viewMode = "month"; view = new Date(focusedDate().getFullYear(), focusedDate().getMonth(), 1); render(); });
    document.querySelector("#week-view").addEventListener("click", () => { viewMode = "week"; render(); });
    document.addEventListener("goodmarketing:language-change", render);
    render();
  }

  const briefForm = document.querySelector("#brief-form");
  if (briefForm) briefForm.addEventListener("submit", (event) => event.preventDefault());
  const directMessagePreference = document.querySelector("#direct-message-responses");
  const directMessageSaved = document.querySelector("#direct-message-settings-saved");
  if (directMessagePreference) {
    const settingKey = () => window.GMAuth?.key("directMessageResponses") || "goodmarketing.directMessageResponses";
    const loadPreference = () => { try { directMessagePreference.checked = localStorage.getItem(settingKey()) === "true"; } catch {} };
    if (window.GMAuth?.identity) loadPreference();
    else document.addEventListener("goodmarketing:account-ready", loadPreference, { once: true });
    directMessagePreference.addEventListener("change", () => {
      try {
        localStorage.setItem(settingKey(), String(directMessagePreference.checked));
        if (directMessageSaved) directMessageSaved.hidden = false;
      } catch {
        if (directMessageSaved) {
          directMessageSaved.hidden = false;
          directMessageSaved.textContent = language() === "es" ? "No se pudo guardar en este navegador." : "Could not save in this browser.";
        }
      }
    });
  }
  const assetModeButtons = [...document.querySelectorAll("[data-asset-mode]")];
  const assetModePanels = {
    upload: document.querySelector("#asset-upload-panel"),
    templates: document.querySelector("#asset-template-panel")
  };
  function setAssetMode(mode) {
    assetModeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.assetMode === mode)));
    Object.entries(assetModePanels).forEach(([name, panel]) => {
      if (panel) panel.hidden = name !== mode;
    });
  }
  assetModeButtons.forEach((button) => button.addEventListener("click", () => setAssetMode(button.dataset.assetMode)));
  if (assetModeButtons.length) {
    const selectedMode = assetModeButtons.find((button) => button.getAttribute("aria-pressed") === "true")?.dataset.assetMode || "templates";
    setAssetMode(selectedMode);
  }

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
  const contentPicker = document.querySelector("#content-assets");
  document.querySelector("[data-open-content-picker]")?.addEventListener("click", () => contentPicker?.click());
  contentPicker?.addEventListener("change", updateCampaignContentEstimate);
  const startAiContent = document.querySelector("#start-ai-content");
  const aiContentPathStatus = document.querySelector("#ai-content-path-status");
  startAiContent?.addEventListener("click", () => {
    startAiContent.setAttribute("aria-pressed", "true");
    startAiContent.closest(".content-option")?.classList.add("is-selected");
    if (aiContentPathStatus) aiContentPathStatus.hidden = false;
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
  const campaignName = document.querySelector("#campaign-name");
  const campaignNameError = document.querySelector("#campaign-name-error");
  const campaignStages = [...document.querySelectorAll("[data-campaign-stage]")];
  const stepButtons = [...document.querySelectorAll("[data-step-target]")];
  function clearCampaignNameError() {
    if (!campaignName || !campaignNameError) return;
    campaignName.removeAttribute("aria-invalid");
    campaignNameError.hidden = true;
  }
  function validateCampaignName() {
    if (campaignName?.value.trim()) {
      clearCampaignNameError();
      return true;
    }
    campaignName?.setAttribute("aria-invalid", "true");
    if (campaignNameError) campaignNameError.hidden = false;
    return false;
  }
  campaignName?.addEventListener("input", () => {
    if (campaignName.value.trim()) clearCampaignNameError();
  });
  const strategyPlatforms = [...document.querySelectorAll("#campaign-stage-1 [data-strategy-platform]")];
  const strategyDuration = document.querySelector("#campaign-stage-1 #strategy-duration");
  const strategyDurationOutput = document.querySelector("#campaign-stage-1 [data-strategy-duration-output]");
  const strategyFrequencies = [...document.querySelectorAll('#campaign-stage-1 input[name="strategy-frequency"]')];
  const contentEstimateNumber = document.querySelector("#campaign-stage-2 [data-content-estimate-number]");
  const contentEstimateLabel = document.querySelector("#campaign-stage-2 [data-content-estimate-label]");
  const contentEstimateNote = document.querySelector("#campaign-stage-2 [data-content-estimate-note]");
  function updateCampaignContentEstimate() {
    if (!strategyDuration || !contentEstimateNumber || !contentEstimateLabel || !contentEstimateNote) return;
    const currentLanguage = language() === "es" ? "es" : "en";
    const frequency = strategyFrequencies.find((option) => option.checked);
    const postsPerWeek = { low: 3, medium: 4, high: 5 }[frequency?.value] || 4;
    const days = Number(strategyDuration.value);
    const contentPieces = Math.ceil((postsPerWeek * days) / 7);
    const uploadedPieces = contentPicker?.files.length || 0;
    const generatedPieces = document.querySelectorAll("#campaign-stage-2 [data-generated-content]").length;
    const completedPieces = uploadedPieces + generatedPieces;
    const numberFormat = new Intl.NumberFormat(currentLanguage);
    contentEstimateNumber.textContent = `${numberFormat.format(completedPieces)}/${numberFormat.format(contentPieces)}`;
    contentEstimateLabel.textContent = currentLanguage === "es"
      ? `pieza${contentPieces === 1 ? "" : "s"} de contenido`
      : `content piece${contentPieces === 1 ? "" : "s"}`;
    contentEstimateNote.textContent = currentLanguage === "es"
      ? `Según ${postsPerWeek} publicaciones por semana durante ${days} ${days === 1 ? "día" : "días"}. Se redondea hacia arriba para cubrir toda la campaña.`
      : `Based on ${postsPerWeek} posts per week over ${days} ${days === 1 ? "day" : "days"}. Rounded up to cover the full campaign.`;
  }
  function updateCampaignStrategyLanguage() {
    const currentLanguage = language() === "es" ? "es" : "en";
    strategyPlatforms.forEach((platform) => {
      const selected = platform.getAttribute("aria-pressed") === "true";
      const platformName = platform.querySelector(".strategy-platform-name")?.textContent.trim() || platform.dataset.strategyPlatform;
      const state = selected ? { en: "selected", es: "seleccionado" } : { en: "not selected", es: "no seleccionado" };
      platform.setAttribute("aria-label", `${platformName}, ${state[currentLanguage]}`);
    });
    if (strategyDuration && strategyDurationOutput) {
      const days = Number(strategyDuration.value);
      const duration = currentLanguage === "es" ? `${days} ${days === 1 ? "día" : "días"}` : `${days} ${days === 1 ? "day" : "days"}`;
      strategyDurationOutput.textContent = duration;
      strategyDuration.setAttribute("aria-valuetext", duration);
    }
    updateCampaignContentEstimate();
  }
  strategyPlatforms.forEach((platform) => platform.addEventListener("click", () => {
    platform.setAttribute("aria-pressed", String(platform.getAttribute("aria-pressed") !== "true"));
    updateCampaignStrategyLanguage();
    renderChannelSummaries();
    renderContentPreview();
  }));
  strategyDuration?.addEventListener("input", updateCampaignStrategyLanguage);
  strategyFrequencies.forEach((frequency) => frequency.addEventListener("change", updateCampaignContentEstimate));
  updateCampaignStrategyLanguage();
  function showCampaignStep(step, moveFocus = true) {
    const blocked = step > 1 && !validateCampaignName();
    if (blocked) step = 1;
    campaignStages.forEach((stage) => { stage.hidden = stage.dataset.campaignStage !== String(step); });
    stepButtons.forEach((button) => {
      const active = button.dataset.stepTarget === String(step);
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    if (blocked) campaignName?.focus();
    else if (moveFocus) document.querySelector(`#campaign-stage-${step} h2`)?.focus();
    if (step === 2) { renderChannelSummaries(); renderContentPreview(); }
    if (step === 3) { renderChannelSummaries(); renderSchedulePreview(); }
  }
  stepButtons.forEach((button) => button.addEventListener("click", () => showCampaignStep(Number(button.dataset.stepTarget))));
  document.querySelectorAll("[data-next-step]").forEach((button) => button.addEventListener("click", () => showCampaignStep(Number(button.dataset.nextStep))));
  document.querySelectorAll("[data-prev-step]").forEach((button) => button.addEventListener("click", () => showCampaignStep(Number(button.dataset.prevStep))));
  if (campaignForm) campaignForm.addEventListener("submit", (event) => { event.preventDefault(); showCampaignStep(2); });

  function renderContentPreview() {
    const contentLabel = language() === "es" ? "Contenido de campaña" : "Campaign content";
    document.querySelectorAll("#content-preview-format, #schedule-preview-format").forEach((element) => { element.textContent = contentLabel; });
  }

  function renderChannelSummaries() {
    const selectedChannels = strategyPlatforms.length
      ? strategyPlatforms.filter((platform) => platform.getAttribute("aria-pressed") === "true").map((platform) => platform.querySelector(".strategy-platform-name")?.textContent.trim()).filter(Boolean)
      : [...document.querySelectorAll("[data-campaign-channel]:checked")].map((input) => input.closest("label")?.querySelector("span")?.textContent.trim()).filter(Boolean);
    ["#content-channel-summary", "#schedule-channel-summary"].forEach((selector) => {
      const container = document.querySelector(selector);
      if (!container) return;
      container.replaceChildren();
      if (!selectedChannels.length) {
        const empty = document.createElement("span");
        empty.className = "channel-empty";
        empty.textContent = language() === "es" ? "Elige canales para verlos aquí." : "Choose channels to see them here.";
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


  placeholders();
  sampleValues();
  document.addEventListener("goodmarketing:language-change", () => {
    updateCampaignStrategyLanguage();
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
