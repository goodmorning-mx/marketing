(() => {
  const card = document.querySelector(".metric-engagement");
  if (!card) return;

  const ranges = {
    campaign: {
      summary: ["Overall · campaign to date", "Total · campaña hasta la fecha"],
      labels: [["Week 1", "Week 2", "Week 3", "Week 4"], ["Semana 1", "Semana 2", "Semana 3", "Semana 4"]],
      values: {
        facebook: [28, 42, 38, 64],
        instagram: [34, 51, 47, 76],
        whatsapp: [20, 31, 28, 49],
        overall: [30, 46, 42, 71],
      },
    },
    all: {
      summary: ["Overall · all time", "Total · todo el tiempo"],
      labels: [["Jan", "Mar", "May", "Jul", "Sep", "Nov"], ["Ene", "Mar", "May", "Jul", "Sep", "Nov"]],
      values: {
        facebook: [22, 31, 38, 42, 55, 66],
        instagram: [18, 29, 41, 53, 69, 83],
        whatsapp: [14, 24, 29, 36, 45, 55],
        overall: [20, 30, 40, 49, 65, 78],
      },
    },
    weekly: {
      summary: ["Overall · last 7 days", "Total · últimos 7 días"],
      labels: [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]],
      values: {
        facebook: [30, 36, 32, 46, 43, 58, 66],
        instagram: [38, 48, 43, 61, 56, 74, 86],
        whatsapp: [22, 29, 25, 39, 34, 49, 55],
        overall: [32, 40, 37, 56, 50, 72, 81],
      },
    },
    monthly: {
      summary: ["Overall · last 4 weeks", "Total · últimas 4 semanas"],
      labels: [["Week 1", "Week 2", "Week 3", "Week 4"], ["Semana 1", "Semana 2", "Semana 3", "Semana 4"]],
      values: {
        facebook: [27, 35, 48, 64],
        instagram: [31, 46, 62, 80],
        whatsapp: [19, 28, 40, 52],
        overall: [29, 41, 57, 74],
      },
    },
  };

  const series = ["facebook", "instagram", "whatsapp", "overall"];
  const buttons = [...card.querySelectorAll("[data-engagement-period]")];
  const paths = Object.fromEntries([...card.querySelectorAll("[data-engagement-series]")].map((node) => [node.dataset.engagementSeries, node]));
  const points = Object.fromEntries([...card.querySelectorAll("[data-engagement-point]")].map((node) => [node.dataset.engagementPoint, node]));
  const days = card.querySelector(".engagement-days");
  const summary = card.querySelector("[data-engagement-period-label]");
  const chart = card.querySelector("svg[role='img']");
  let selected = "weekly";

  function languageIndex() {
    return document.documentElement.lang === "es" ? 1 : 0;
  }

  function render() {
    const range = ranges[selected];
    const locale = languageIndex();
    const labels = range.labels[locale];
    const lastX = 420;
    const bottomY = 90;
    const scaleY = 0.78;
    const xForIndex = (index) => labels.length === 1 ? lastX / 2 : index * lastX / (labels.length - 1);

    for (const name of series) {
      const values = range.values[name];
      const coords = values.map((value, index) => [xForIndex(index), bottomY - value * scaleY]);
      paths[name].setAttribute("d", coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "));
      points[name].setAttribute("cx", coords.at(-1)[0]);
      points[name].setAttribute("cy", coords.at(-1)[1]);
    }

    days.replaceChildren(...labels.map((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      return item;
    }));
    summary.textContent = range.summary[locale];
    chart.setAttribute("aria-label", locale
      ? `Tendencias de interacción general y por plataforma: ${range.summary[locale]}`
      : `Overall and platform engagement trends: ${range.summary[locale]}`);
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.engagementPeriod === selected)));
  }

  buttons.forEach((button) => button.addEventListener("click", () => {
    if (!ranges[button.dataset.engagementPeriod]) return;
    selected = button.dataset.engagementPeriod;
    render();
  }));
  document.addEventListener("goodmarketing:language-change", render);
  render();
})();
