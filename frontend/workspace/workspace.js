(() => {
  const grid = document.querySelector("#calendar-grid");
  if (!grid) return;

  const monthLabel = document.querySelector("#month-label");
  const selectedLabel = document.querySelector("#selected-date");
  const eventsContainer = document.querySelector("#day-events");
  const weekdays = {
    en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    es: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
  };
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const events = {
    "2026-11-20": [{ time: "10:00", title: { en: "Review campaign drafts", es: "Revisar borradores de campaña" } }],
    "2026-11-21": [{ time: "13:30", title: { en: "Autumn campaign · content review", es: "Campaña de otoño · revisión de contenido" } }],
    "2026-11-24": [{ time: "09:00", title: { en: "Autumn campaign · milestone", es: "Campaña de otoño · hito" }, milestone: true }, { time: "15:00", title: { en: "Community story", es: "Historia de comunidad" } }],
    "2026-11-26": [{ time: "11:00", title: { en: "Monthly recap", es: "Resumen mensual" } }],
    "2026-11-28": [{ time: "10:30", title: { en: "Customer spotlight", es: "Enfoque en clientes" } }],
    "2026-11-30": [{ time: "14:00", title: { en: "Campaign check-in", es: "Revisión de campaña" } }]
  };
  const today = new Date();
  const todayKey = dateKey(today);
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = todayKey;

  const language = () => document.documentElement.lang === "es" ? "es" : "en";
  const dateFormatter = (options) => new Intl.DateTimeFormat(language() === "es" ? "es-MX" : "en-US", options);

  function renderEvents() {
    const date = new Date(`${selected}T12:00:00`);
    selectedLabel.textContent = dateFormatter({ weekday: "short", month: "short", day: "numeric" }).format(date);
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

    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = dateKey(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `date-cell${date.getMonth() !== month ? " outside" : ""}${key === selected ? " selected" : ""}${key === todayKey ? " today-mark" : ""}`;
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-pressed", String(key === selected));
      button.setAttribute("aria-label", dateFormatter({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date));
      const number = document.createElement("span");
      number.className = "date-num";
      number.textContent = String(date.getDate());
      button.append(number);
      if (events[key]) {
        const dots = document.createElement("span");
        dots.className = "event-dots";
        dots.setAttribute("aria-hidden", "true");
        events[key].slice(0, 3).forEach((event) => {
          const dot = document.createElement("i");
          if (event.milestone) dot.className = "milestone";
          dots.append(dot);
        });
        button.append(dots);
      }
      button.addEventListener("click", () => {
        selected = key;
        render();
      });
      grid.append(button);
    }
    renderEvents();
  }

  document.querySelector("#prev-month").addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    render();
  });
  document.querySelector("#next-month").addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    render();
  });
  document.querySelector("#today-button").addEventListener("click", () => {
    view = new Date(today.getFullYear(), today.getMonth(), 1);
    selected = todayKey;
    render();
  });
  document.addEventListener("goodmarketing:language-change", render);
  render();
})();
