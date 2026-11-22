(() => {
  const card = document.querySelector(".metric-engagement");
  const data = window.GoodMarketingEngagementData;
  if (!card || !data) return;

  const platformNames = { facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp" };
  const scopeNames = {
    overall: ["Overall", "Total"],
    facebook: ["Facebook", "Facebook"],
    instagram: ["Instagram", "Instagram"],
    whatsapp: ["WhatsApp", "WhatsApp"],
  };
  const periodButtons = [...card.querySelectorAll("[data-engagement-period]")];
  const scopeButtons = [...card.querySelectorAll("[data-engagement-scope]")];
  const paths = Object.fromEntries([...card.querySelectorAll("[data-engagement-series]")].map((node) => [node.dataset.engagementSeries, node]));
  const points = Object.fromEntries([...card.querySelectorAll("[data-engagement-point]")].map((node) => [node.dataset.engagementPoint, node]));
  const rows = Object.fromEntries([...card.querySelectorAll("[data-platform-row]")].map((node) => [node.dataset.platformRow, node]));
  const days = card.querySelector(".engagement-days");
  const total = card.querySelector("[data-engagement-total]");
  const periodLabel = card.querySelector("[data-engagement-period-label]");
  const scopeNote = card.querySelector("[data-engagement-scope-note]");
  const textSummary = card.querySelector("[data-engagement-accessible-summary]");
  const chart = card.querySelector("svg[role='img']");
  let selectedPeriod = "weekly";
  let selectedScope = "overall";

  const languageIndex = () => document.documentElement.lang === "es" ? 1 : 0;
  const localeTag = () => languageIndex() ? "es-MX" : "en-US";
  const formatCount = (value) => data.formatValue(value, localeTag());

  function coverageText(summary) {
    if (!summary.expectedCount) return languageIndex() ? "Sin puntos disponibles" : "No points available";
    if (!summary.observedCount) return languageIndex()
      ? `0 de ${summary.expectedCount} puntos con datos`
      : `0 of ${summary.expectedCount} points recorded`;
    return languageIndex()
      ? `${summary.observedCount} de ${summary.expectedCount} puntos con datos`
      : `${summary.observedCount} of ${summary.expectedCount} points recorded`;
  }

  function pathFor(values, labelCount, scaleY) {
    const lastX = 420;
    const bottomY = 90;
    const xForIndex = (index) => labelCount === 1 ? lastX / 2 : index * lastX / (labelCount - 1);
    let connected = false;
    const commands = [];

    for (let index = 0; index < labelCount; index += 1) {
      const value = values[index];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        connected = false;
        continue;
      }
      const command = connected ? "L" : "M";
      commands.push(`${command}${xForIndex(index).toFixed(1)} ${(bottomY - value * scaleY).toFixed(1)}`);
      connected = true;
    }
    return commands.join(" ");
  }

  function formatAccessibleSummary(snapshot) {
    const locale = languageIndex();
    const scopeName = scopeNames[snapshot.scope][locale];
    const period = snapshot.period[locale];
    if (snapshot.total.value === null) {
      return locale
        ? `${scopeName}, ${period}: no hay datos registrados. ${coverageText(snapshot.total)}.`
        : `${scopeName}, ${period}: no data recorded. ${coverageText(snapshot.total)}.`;
    }

    const totalText = formatCount(snapshot.total.value);
    if (snapshot.scope === "overall") {
      const perPlatform = data.platforms.map((platform) =>
        `${platformNames[platform]}: ${formatCount(snapshot.platformTotals[platform].value)}`
      ).join("; ");
      const availability = snapshot.total.missingCount
        ? (locale
          ? `Incluye ${snapshot.total.observedCount} de ${snapshot.total.expectedCount} registros; se excluyen los faltantes.`
          : `Includes ${snapshot.total.observedCount} of ${snapshot.total.expectedCount} records; missing records are excluded.`)
        : "";
      return locale
        ? `Total, ${period}: ${totalText} interacciones. ${perPlatform}.${availability ? ` ${availability}` : ""}`
        : `Overall, ${period}: ${totalText} interactions. ${perPlatform}.${availability ? ` ${availability}` : ""}`;
    }

    const missingNote = snapshot.total.missingCount
      ? (locale ? "Los puntos faltantes no se cuentan." : "Missing points are not counted.")
      : "";
    return locale
      ? `${scopeName}, ${period}: ${totalText} interacciones. ${coverageText(snapshot.total)}. ${missingNote}`.trim()
      : `${scopeName}, ${period}: ${totalText} interactions. ${coverageText(snapshot.total)}. ${missingNote}`.trim();
  }

  function render() {
    const range = data.ranges[selectedPeriod];
    const snapshot = data.snapshot(range, selectedScope);
    const locale = languageIndex();
    const labels = range.labels[locale];
    const scopeName = scopeNames[selectedScope][locale];
    const totalText = formatCount(snapshot.total.value);
    const maximum = Math.max(0, ...snapshot.values.filter((value) => typeof value === "number" && Number.isFinite(value)));
    const scaleY = maximum > 0 ? 78 / maximum : 0;

    for (const [seriesName, path] of Object.entries(paths)) {
      const active = selectedScope === "overall" ? seriesName === "overall" : seriesName === selectedScope;
      const values = seriesName === "overall" ? data.overallSeries(range.values) : (range.values[seriesName] || []);
      const pathData = pathFor(values, labels.length, scaleY);
      path.setAttribute("d", pathData);
      if (active && pathData) path.removeAttribute("display");
      else path.setAttribute("display", "none");

      const point = points[seriesName];
      const lastValue = values[labels.length - 1];
      if (!point) continue;
      if (!active || typeof lastValue !== "number" || !Number.isFinite(lastValue)) {
        point.setAttribute("display", "none");
        continue;
      }
      point.removeAttribute("display");
      point.setAttribute("cx", "420");
      point.setAttribute("cy", String(90 - lastValue * scaleY));
    }

    days.replaceChildren(...labels.map((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      return item;
    }));
    total.textContent = totalText;
    periodLabel.textContent = `${scopeName} · ${range.period[locale]}`;
    scopeNote.textContent = selectedScope === "overall"
      ? (locale
        ? "Total incluye los registros disponibles de Facebook, Instagram y WhatsApp; los datos faltantes se excluyen."
        : "Overall includes available Facebook, Instagram, and WhatsApp records; missing data is excluded.")
      : (locale
        ? `Alcance: solo registros de ${scopeName}.`
        : `Scope: ${scopeName} records only.`);
    textSummary.textContent = formatAccessibleSummary(snapshot);
    chart.setAttribute("aria-label", textSummary.textContent);

    periodButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.engagementPeriod === selectedPeriod)));
    scopeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.engagementScope === selectedScope)));
    for (const platform of data.platforms) {
      const row = rows[platform];
      const platformSummary = snapshot.platformTotals[platform];
      row.hidden = selectedScope !== "overall" && selectedScope !== platform;
      row.querySelector(`[data-platform-total="${platform}"]`).textContent = formatCount(platformSummary.value);
      row.querySelector(`[data-platform-coverage="${platform}"]`).textContent = coverageText(platformSummary);
    }
  }

  periodButtons.forEach((button) => button.addEventListener("click", () => {
    if (!data.ranges[button.dataset.engagementPeriod]) return;
    selectedPeriod = button.dataset.engagementPeriod;
    render();
  }));
  scopeButtons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.engagementScope !== "overall" && !data.platforms.includes(button.dataset.engagementScope)) return;
    selectedScope = button.dataset.engagementScope;
    render();
  }));
  document.addEventListener("goodmarketing:language-change", render);
  render();
})();
