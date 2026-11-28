(() => {
  const api = () => window.GMAuth;
  const request = (path, options) => api().request(path, options);
  const es = () => document.documentElement.lang === "es";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const date = (value) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat(document.documentElement.lang === "es" ? "es-MX" : "en-US", { dateStyle: "medium" }).format(parsed);
  };
  async function list() {
    const response = await request("/workspace/campaigns");
    if (!response.ok) throw new Error("Campaigns could not be loaded.");
    return (await response.json()).campaigns;
  }
  const detailUrl = (id) => `/workspace/campaigns/detail/?id=${encodeURIComponent(id)}`;
  const statusLabel = (campaign) => campaign.archived_at
    ? (es() ? "ARCHIVADA" : "ARCHIVED")
    : campaign.status === "draft" ? (es() ? "BORRADOR" : "DRAFT") : esc(campaign.status || (es() ? "BORRADOR" : "DRAFT"));
  const frequencyLabel = (frequency) => {
    const labels = es() ? { low: "Baja", medium: "Media", high: "Alta" } : { low: "Low", medium: "Medium", high: "High" };
    return labels[frequency] || frequency || (es() ? "No disponible" : "Unavailable");
  };
  let savedCampaignConfirmationId = null;
  function campaignCard(campaign) {
    const windowText = campaign.start_date && campaign.end_date ? `${date(campaign.start_date)} – ${date(campaign.end_date)}` : "";
    return `<article class="campaign-list-item"><div class="campaign-list-copy"><div class="campaign-list-title"><div><span class="status-pill">${statusLabel(campaign)}</span><h3>${esc(campaign.name)}</h3></div><span class="campaign-window">${esc(windowText)}</span></div><p>${esc(campaign.objective || "")}</p><div class="campaign-list-bottom"><span>${campaign.duration_days ? `${campaign.duration_days} ${es() ? "días" : "days"} · ${esc(frequencyLabel(campaign.posting_frequency))}` : (es() ? "Duración y frecuencia no disponibles" : "Duration and frequency unavailable")}</span><a class="secondary-link" href="${detailUrl(campaign.id)}">${es() ? "Abrir campaña" : "Open campaign"}</a></div></div></article>`;
  }
  async function renderList(campaigns) {
    const host = document.querySelector("#campaign-list-items");
    if (!host) return;
    const status = document.querySelector("#campaign-list-status");
    try {
      if (campaignsLoadFailed) throw new Error("list unavailable");
      host.innerHTML = campaigns.map(campaignCard).join("") || `<p>${es() ? "Aún no hay campañas guardadas. Inicia una campaña para crear tu primer plan." : "No saved campaigns yet. Start a campaign to create your first plan."}</p>`;
      status.textContent = es() ? `${campaigns.length} campaña${campaigns.length === 1 ? "" : "s"} guardada${campaigns.length === 1 ? "" : "s"}` : `${campaigns.length} saved campaign${campaigns.length === 1 ? "" : "s"}`;
    } catch { status.textContent = es() ? "No se pudieron cargar las campañas. Recarga para intentarlo de nuevo." : "Campaigns could not be loaded. Reload to try again."; }
  }
  async function renderOverview(campaigns) {
    const host = document.querySelector("#saved-campaign-summary");
    if (!host) return;
    try {
      if (campaignsLoadFailed) throw new Error("list unavailable");
      const open = campaigns.filter((campaign) => !campaign.archived_at);
      const recent = open[0];
      host.innerHTML = `<p>${es() ? `${open.length} campaña${open.length === 1 ? "" : "s"} abierta${open.length === 1 ? "" : "s"}` : `${open.length} open saved campaign${open.length === 1 ? "" : "s"}`}</p>${recent ? `<a class="subtle-link" href="${detailUrl(recent.id)}">${es() ? "Abrir " : "Open "}${esc(recent.name)}</a>` : `<p>${es() ? "Aún no hay planes guardados." : "No saved campaign plans yet."}</p>`}`;
    } catch { host.textContent = es() ? "Los planes guardados no están disponibles." : "Saved campaign plans are unavailable."; }
  }
  async function renderDetail() {
    const host = document.querySelector("#campaign-detail-content");
    if (!host) return;
    const id = new URLSearchParams(location.search).get("id");
    if (!id || !/^[1-9]\d{0,9}$/.test(id)) { host.textContent = es() ? "Esta campaña no está disponible." : "This campaign is unavailable."; return; }
    try {
      const response = await request(`/workspace/campaigns/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error();
      const campaign = (await response.json()).campaign;
      const text = es() ? { archived: "ARCHIVADA", draft: "BORRADOR", noObjective: "No se guardó un objetivo.", platforms: "Plataformas", none: "Ninguna seleccionada", duration: "Duración", days: "días", frequency: "Frecuencia de publicación", dates: "Fechas de campaña", unavailable: "No disponible", calendar: "Ver calendario de campaña", edit: "Editar plan", archive: "Archivar campaña", stale: "Esta campaña cambió. Recarga antes de archivarla.", failed: "No se pudo archivar la campaña.", offline: "No se pudo conectar con el espacio. No se confirmó el archivo de la campaña." } : { archived: "ARCHIVED", draft: "DRAFT", noObjective: "No objective saved.", platforms: "Platforms", none: "None selected", duration: "Duration", days: "days", frequency: "Posting frequency", dates: "Campaign dates", unavailable: "Unavailable", calendar: "View campaign calendar", edit: "Edit plan", archive: "Archive campaign", stale: "This campaign changed. Reload before archiving.", failed: "Could not archive campaign.", offline: "Could not reach the workspace. Your campaign was not confirmed as archived." };
      const frequency = campaign.posting_frequency ? frequencyLabel(campaign.posting_frequency) : text.unavailable;
      host.innerHTML = `<p class="eyebrow">${statusLabel(campaign)}</p><h1>${esc(campaign.name)}</h1><p>${esc(campaign.objective || text.noObjective)}</p><dl><dt>${text.platforms}</dt><dd>${esc((campaign.platforms || []).map((p) => es() ? ({ facebook: "Facebook", instagram: "Instagram" }[p] || p) : p).join(", ") || text.none)}</dd><dt>${text.duration}</dt><dd>${campaign.duration_days ? `${campaign.duration_days} ${text.days}` : text.unavailable}</dd><dt>${text.frequency}</dt><dd>${esc(frequency)}</dd><dt>${text.dates}</dt><dd>${campaign.start_date && campaign.end_date ? `${date(campaign.start_date)} – ${date(campaign.end_date)}` : text.unavailable}</dd></dl><a class="secondary-link" href="/workspace/calendar/?campaign_id=${encodeURIComponent(campaign.id)}">${text.calendar}</a><a class="secondary-link" href="/workspace/new-campaign/?id=${encodeURIComponent(campaign.id)}">${text.edit}</a>${campaign.archived_at ? "" : `<button type="button" id="archive-campaign">${text.archive}</button>`}<p id="campaign-detail-status" role="status"></p>`;
      try {
        const confirmation = JSON.parse(sessionStorage.getItem("gm-campaign-navigation-status") || "null");
        if (confirmation?.workspace === api().identity.organization_id && confirmation.id === String(campaign.id) && confirmation.path === "/workspace/campaigns/detail/" && confirmation.message === "saved") {
          sessionStorage.removeItem("gm-campaign-navigation-status");
          savedCampaignConfirmationId = String(campaign.id);
        }
      } catch {}
      if (savedCampaignConfirmationId === String(campaign.id)) {
        const notice = document.createElement("p"); notice.id = "campaign-save-confirmation"; notice.setAttribute("role", "status"); notice.textContent = es() ? "Se guardó el borrador de campaña." : "Campaign draft saved."; host.prepend(notice);
      }
      const archive = host.querySelector("#archive-campaign");
      archive?.addEventListener("click", async () => {
        archive.disabled = true;
        const etag = response.headers.get("ETag");
        let result;
        try { result = await request(`/workspace/campaigns/${encodeURIComponent(campaign.id)}/archive`, { method: "POST", headers: { "If-Match": etag } }); }
        catch { host.querySelector("#campaign-detail-status").textContent = text.offline; archive.disabled = false; return; }
        if (result.ok) location.reload();
        else { host.querySelector("#campaign-detail-status").textContent = result.status === 412 ? text.stale : text.failed; archive.disabled = false; }
      });
    } catch { host.textContent = es() ? "Esta campaña no está disponible." : "This campaign is unavailable."; }
  }
  let campaignsCache = [], campaignsLoadFailed = false;
  let calendarUpdate = null;
  document.addEventListener("goodmarketing:account-ready", async () => {
    try { campaignsCache = await list(); campaignsLoadFailed = false; }
    catch { campaignsCache = []; campaignsLoadFailed = true; }
    if (document.querySelector("#campaign-calendar-filter")) {
      const filter = document.querySelector("#campaign-calendar-filter");
      campaignsCache.forEach((campaign) => filter.add(new Option(campaign.name, campaign.id)));
      const id = new URLSearchParams(location.search).get("campaign_id");
        if (id) {
        filter.value = id;
        if (!campaignsCache.some((campaign) => String(campaign.id) === id)) {
          const invalid = new Option(es() ? "Campaña no disponible" : "Campaign unavailable", id); invalid.selected = true; filter.add(invalid);
        }
      }
      const update = () => {
        const selected = campaignsCache.find((campaign) => String(campaign.id) === filter.value);
        const demo = document.querySelector(".calendar-page-panel"), empty = document.querySelector("#campaign-calendar-empty");
        const notice = document.querySelector("#calendar-demo-notice");
        if (selected) { demo.hidden = true; notice.hidden = true; empty.hidden = false; empty.innerHTML = `<h2>${esc(selected.name)}</h2><p>${es() ? "No hay eventos programados para esta campaña." : "No scheduled events for this campaign."}</p>`; }
        else if (filter.value || campaignsLoadFailed && new URLSearchParams(location.search).has("campaign_id")) { demo.hidden = true; notice.hidden = true; empty.hidden = false; empty.textContent = es() ? "Esta campaña no está disponible." : "This campaign is unavailable."; }
        else { demo.hidden = false; notice.hidden = false; empty.hidden = true; }
      };
      filter.addEventListener("change", update); calendarUpdate = update; update();
    }
    renderList(campaignsCache); renderOverview(campaignsCache); renderDetail();
  });
  document.addEventListener("goodmarketing:language-change", () => {
    if (!window.GMAuth) return;
    renderList(campaignsCache); renderOverview(campaignsCache); renderDetail(); calendarUpdate?.();
  });
})();
