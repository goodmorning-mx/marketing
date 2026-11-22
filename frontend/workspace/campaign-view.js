/* Existing page shells consume one read-only demo projection; no customer adapter or storage. */
(() => {
  const records = window.GoodMarketingDemoCampaigns;
  const selectors = window.GoodMarketingCampaigns;
  const asOf = new Date().toISOString(); // One consistent read-only snapshot per page visit.
  const language = () => document.documentElement.lang === "es" ? "es" : "en";
  const locale = () => language() === "es" ? "es-MX" : "en-US";
  const text = (value) => typeof value === "string" ? value : value?.[language()] || "";
  const statusLabels = {
    active: ["Active", "Activa"], overdue: ["Overdue", "Atrasado"], posted: ["Published", "Publicado"], scheduled: ["Scheduled", "Programado"],
    partial: ["Partially published", "Publicación parcial"], blocked: ["Blocked", "Bloqueado"],
    cancelled: ["Cancelled", "Cancelado"], unconfirmed: ["Publication unconfirmed", "Publicación sin confirmar"],
    unscheduled: ["No scheduled time", "Sin horario programado"], queued: ["Queued", "En cola"],
    pending: ["Pending", "Pendiente"], failed: ["Failed", "Fallido"],
  };
  const statusLabel = (status) => statusLabels[status]?.[language() === "es" ? 1 : 0] || (language() === "es" ? "Sin datos" : "Unavailable");
  const calendarLink = (id) => `/workspace/calendar/?campaign=${encodeURIComponent(id)}`;
  function postText(post, timeZone, view) {
    if (!post) return language() === "es" ? (view === "next" ? "No hay publicaciones futuras elegibles." : "No hay publicaciones confirmadas.")
      : (view === "next" ? "No eligible upcoming post." : "No confirmed publication.");
    const partial = post.status === "partial" ? `${statusLabel("partial")} · ` : "";
    return `${partial}${text(post.content.title)} · ${selectors.formatDate(post.at, timeZone, locale())} · ${selectors.formatTime(post.at, timeZone, locale())} · ${timeZone}`;
  }
  function render() {
    if (!records || !selectors) return;
    const list = document.querySelector("[data-campaign-list]");
    const template = document.querySelector("template[data-campaign-template]");
    if (list && template) {
      const cards = records.campaigns.map((campaign) => {
        const fragment = template.content.cloneNode(true);
        fragment.querySelector("[data-demo-campaign]").dataset.demoCampaign = campaign.id;
        return fragment;
      });
      list.replaceChildren(...cards);
    }
    document.querySelectorAll("[data-demo-campaign-count]").forEach((element) => { element.textContent = String(records.campaigns.length); });
    document.querySelectorAll("[data-demo-campaign]").forEach((root) => {
      const summary = selectors.summarize(records, root.dataset.demoCampaign, asOf);
      if (!summary) return;
      const { campaign } = summary;
      root.querySelectorAll("[data-i18n][data-en][data-es]").forEach((element) => { element.textContent = element.dataset[language()]; });
      if (document.querySelector("[data-campaign-document-title]")) document.title = `${campaign.name} — GoodMarketing`;
      const remaining = summary.remaining.phase === "ended" ? (language() === "es" ? "Campaña finalizada" : "Campaign ended")
        : summary.remaining.phase === "not-started" ? (language() === "es" ? "Campaña aún no iniciada" : "Campaign not started")
          : language() === "es" ? `${summary.remaining.days} días restantes` : `${summary.remaining.days} days remaining`;
      const fields = {
        name: campaign.name, status: statusLabel(campaign.status), description: text(campaign.description), lead: text(campaign.lead),
        window: `${selectors.dateOnly(campaign.startDate, locale())} – ${selectors.dateOnly(campaign.endDate, locale())}`,
        remaining, timeZone: campaign.timeZone,
        planning: language() === "es" ? "Avance de planificación no disponible" : "Planning progress unavailable",
        upcoming: summary.upcomingCount, overdue: summary.overdueCount, published: summary.publishedContentCount,
        deliveries: summary.confirmedDeliveryCount, partial: summary.partialCount, contentCount: summary.contentCount,
        next: postText(summary.nextPost, campaign.timeZone, "next"), last: postText(summary.lastPost, campaign.timeZone, "last"),
      };
      root.querySelectorAll("[data-campaign-field]").forEach((element) => { element.textContent = String(fields[element.dataset.campaignField] ?? "—"); });
      root.querySelectorAll("[data-campaign-calendar]").forEach((element) => { element.href = calendarLink(campaign.id); });
      root.querySelectorAll("[data-campaign-detail]").forEach((element) => { element.href = campaign.detailPath; });
      root.querySelectorAll("[data-campaign-activity]").forEach((container) => {
        const events = selectors.calendar(records, { campaignId: campaign.id, asOf }).events;
        container.replaceChildren(...events.map((event) => {
          const row = document.createElement("article");
          const date = document.createElement("time");
          date.dateTime = event.at;
          date.textContent = selectors.formatDate(event.at, campaign.timeZone, locale());
          const copy = document.createElement("p");
          const title = document.createElement("strong");
          title.textContent = text(event.title);
          const note = document.createElement("span");
          const kind = event.type === "content" ? statusLabel(event.status) : event.milestone
            ? (language() === "es" ? "Hito" : "Milestone") : (language() === "es" ? "Actividad" : "Activity");
          note.textContent = `${kind} · ${selectors.formatTime(event.at, campaign.timeZone, locale())} · ${campaign.timeZone}`;
          copy.append(title, note); row.append(date, copy); return row;
        }));
      });
    });
  }
  window.GoodMarketingCampaignView = Object.freeze({ asOf, text, statusLabel, calendarLink, postText });
  document.addEventListener("goodmarketing:language-change", render);
  render();
})();
