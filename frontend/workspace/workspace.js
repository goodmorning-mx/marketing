(() => {
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
  const campaignForm = document.querySelector("#campaign-form");
  if (campaignForm) campaignForm.addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelector("#campaign-feedback").textContent = language() === "es" ? "La campaña de ejemplo no se guardó. Este flujo es solo una vista previa." : "The sample campaign was not saved. This flow is preview only.";
  });
  placeholders();
  sampleValues();
  document.addEventListener("goodmarketing:language-change", () => { placeholders(); sampleValues(); });
})();
