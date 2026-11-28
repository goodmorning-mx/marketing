(() => {
  const platforms = ["facebook", "instagram", "whatsapp"];
  const ranges = {
    campaign: {
      period: ["campaign to date", "campaña hasta la fecha"],
      labels: [["Week 1", "Week 2", "Week 3", "Week 4"], ["Semana 1", "Semana 2", "Semana 3", "Semana 4"]],
      values: {
        facebook: [28, 42, 38, 64],
        instagram: [34, 51, 47, 76],
        whatsapp: [20, 31, 28, 49],
      },
    },
    all: {
      period: ["all time", "todo el tiempo"],
      labels: [["Jan", "Mar", "May", "Jul", "Sep", "Nov"], ["Ene", "Mar", "May", "Jul", "Sep", "Nov"]],
      values: {
        facebook: [22, 31, 38, 42, 55, 66],
        instagram: [18, 29, 41, 53, 69, 83],
        whatsapp: [14, 24, 29, 36, 45, 55],
      },
    },
    weekly: {
      period: ["last 7 days", "últimos 7 días"],
      labels: [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]],
      values: {
        facebook: [30, 36, 32, 46, 43, 58, 66],
        instagram: [38, 48, 43, 61, 56, 74, 86],
        whatsapp: [22, 29, 25, 39, 34, 49, 55],
      },
    },
    monthly: {
      period: ["last 4 weeks", "últimas 4 semanas"],
      labels: [["Week 1", "Week 2", "Week 3", "Week 4"], ["Semana 1", "Semana 2", "Semana 3", "Semana 4"]],
      values: {
        facebook: [27, 35, 48, 64],
        instagram: [31, 46, 62, 80],
        whatsapp: [19, 28, 40, 52],
      },
    },
  };

  const isMeasured = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

  function aggregate(values = []) {
    const measured = values.filter(isMeasured);
    return {
      value: measured.length ? measured.reduce((sum, value) => sum + value, 0) : null,
      observedCount: measured.length,
      expectedCount: values.length,
      missingCount: values.length - measured.length,
    };
  }

  function overallSeries(values) {
    const count = Math.max(0, ...platforms.map((platform) => values[platform]?.length || 0));
    return Array.from({ length: count }, (_, index) => {
      const available = platforms.map((platform) => values[platform]?.[index]).filter(isMeasured);
      return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
    });
  }

  function formatValue(value, locale = "en-US") {
    if (value === null) return locale.startsWith("es") ? "Sin datos" : "No data";
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  }

  function snapshot(range, scope = "overall") {
    const selectedScope = platforms.includes(scope) ? scope : "overall";
    const platformTotals = Object.fromEntries(platforms.map((platform) => [platform, aggregate(range.values[platform] || [])]));
    const platformRecords = Object.values(platformTotals);
    const total = selectedScope === "overall"
      ? {
          value: platformRecords.some((item) => item.value !== null)
            ? platformRecords.reduce((sum, item) => sum + (item.value ?? 0), 0)
            : null,
          observedCount: platformRecords.reduce((sum, item) => sum + item.observedCount, 0),
          expectedCount: platformRecords.reduce((sum, item) => sum + item.expectedCount, 0),
          missingCount: platformRecords.reduce((sum, item) => sum + item.missingCount, 0),
        }
      : platformTotals[selectedScope];

    return {
      scope: selectedScope,
      total,
      platformTotals,
      values: selectedScope === "overall" ? overallSeries(range.values) : (range.values[selectedScope] || []),
      labels: range.labels,
      period: range.period,
    };
  }

  const api = Object.freeze({ platforms, ranges, aggregate, overallSeries, formatValue, snapshot });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GoodMarketingEngagementData = api;
})();
