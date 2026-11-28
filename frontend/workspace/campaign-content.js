(() => {
  const host = document.querySelector("#campaign-content-manager");
  if (!host) return;
  const es = () => document.documentElement.lang === "es";
  const copy = {
    loading: () => es() ? "Cargando contenido…" : "Loading content…",
    loadError: () => es() ? "No se pudo cargar el contenido. Intenta recargar." : "Could not load content. Try reloading.",
    empty: () => es() ? "Aún no hay borradores de contenido." : "There are no content drafts yet.",
    noCampaign: () => es() ? "Guarda primero la estrategia para crear borradores de contenido." : "Save the strategy first to create content drafts.",
    ownerOnly: () => es() ? "Solo las personas propietarias pueden guardar o revisar contenido." : "Only workspace owners can save or review content.",
    counts: (items, queued) => {
      const draft = items.filter((item) => item.status === "draft").length;
      const review = items.filter((item) => item.status === "review").length;
      const approved = items.filter((item) => item.status === "approved").length;
      return es() ? items.length + " guardados · " + draft + " borrador · " + review + " en revisión · " + approved + " aprobados · " + queued.length + " sin guardar"
        : items.length + " saved · " + draft + " draft · " + review + " in review · " + approved + " approved · " + queued.length + " unsaved";
    },
    discard: () => es() ? "Descartar cambios" : "Discard changes",
    kind: (k) => ({ text: es() ? "Publicación de texto" : "Text post", link: es() ? "Publicación con enlace" : "Link post", photo: es() ? "Foto" : "Photo", reel: "Reel" })[k],
    caption: () => es() ? "Texto / descripción" : "Caption",
    link: () => es() ? "Enlace HTTPS" : "HTTPS link",
    destinations: () => es() ? "Destinos" : "Destinations",
    save: () => es() ? "Guardar borrador" : "Save draft",
    saving: () => es() ? "Guardando…" : "Saving…",
    saved: () => es() ? "Borrador guardado." : "Draft saved.",
    upload: () => es() ? "Subir archivo" : "Upload file",
    uploading: () => es() ? "Validando y guardando archivo…" : "Validating and saving file…",
    fileSaved: () => es() ? "El archivo privado se guardó." : "Private file saved.",
    review: () => es() ? "Enviar a revisión" : "Send to review",
    approve: () => es() ? "Aprobar" : "Approve",
    return: () => es() ? "Devolver a borrador" : "Return to draft",
    remove: () => es() ? "Eliminar borrador" : "Remove draft",
    confirmRemove: () => es() ? "¿Eliminar este borrador y su archivo privado?" : "Remove this draft and its private file?",
    state: (s) => s === "approved" ? (es() ? "Aprobado" : "Approved") : s === "review" ? (es() ? "En revisión" : "In review") : (es() ? "Borrador" : "Draft"),
    retry: () => es() ? "No se confirmó la respuesta. Reintenta; se conservaron tus cambios." : "The response was not confirmed. Retry; your edits are preserved.",
    stale: () => es() ? "El contenido cambió en otra sesión. Recarga antes de volver a guardar." : "Content changed in another session. Reload before saving again.",
    failed: () => es() ? "No se pudo guardar. Tus cambios siguen aquí." : "Could not save. Your edits are still here.",
    invalid: () => es() ? "Revisa el texto, el destino y el archivo. Tus cambios siguen aquí." : "Check the text, destination and file. Your edits are still here.",
    quota: () => es() ? "El espacio de almacenamiento privado alcanzó su límite." : "Private workspace storage has reached its limit.",
    tooLarge: () => es() ? "El archivo supera el tamaño permitido." : "The file exceeds the allowed size.",
    unsupported: () => es() ? "Elige un archivo JPEG o MP4 compatible." : "Choose a supported JPEG or MP4 file.",
    chooseFile: () => es() ? "Elegir archivo de reemplazo" : "Choose replacement file",
    noFile: () => es() ? "Archivo pendiente" : "File not uploaded yet",
    preview: () => es() ? "Vista previa" : "Preview",
  };
  let campaignId = new URLSearchParams(location.search).get("id");
  let items = [], queue = [], loadedCampaignId = "";
  window.GMCampaignContent = { savedCount: () => items.length };
  const canWrite = () => Boolean(window.GMAuth?.identity?.roles?.includes("owner") && window.GMAuth?.identity?.permissions?.includes("marketing:write"));
  const api = (path, options) => window.GMAuth.request(path, options);
  const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const field = (labelText, control) => { const wrap = make("label", "field campaign-content-field"); wrap.append(make("span", "", labelText), control); return wrap; };
  function status(item, key) {
    item.notice = key;
    if (item.card) { const node = item.card.querySelector("[data-content-status]"); if (node) node.textContent = copy[key]?.() || ""; }
  }
  function markDirty(item, card) {
    item.dirty = true;
    card.querySelectorAll("[data-content-transition]").forEach((button) => { button.disabled = true; });
    card.querySelectorAll("[data-content-discard]").forEach((button) => { button.disabled = false; });
  }
  function revokePreviews() {
    [...items, ...queue].forEach((item) => { if (item.objectUrl) URL.revokeObjectURL(item.objectUrl); item.objectUrl = ""; });
  }
  function supported(kind, file) {
    return kind === "photo" ? file.type === "image/jpeg" && file.size <= 8_000_000
      : kind === "reel" ? file.type === "video/mp4" && file.size <= 32 * 1024 * 1024 : true;
  }
  function render() {
    revokePreviews(); host.replaceChildren();
    host.append(make("p", "campaign-content-count", copy.counts(items, queue)));
    document.querySelector("#selected-content-summary")?.setAttribute("hidden", "");
    const editable = canWrite();
    if (!editable) host.append(make("p", "campaign-content-note", copy.ownerOnly()));
    const all = [...items, ...queue];
    if (!all.length) host.append(make("p", "campaign-content-empty", copy.empty()));
    all.forEach((item) => {
      const card = make("article", "campaign-content-card"); item.card = card;
      const saved = items.includes(item);
      const top = make("div", "campaign-content-card-top");
      top.append(make("h3", "", copy.kind(item.kind)));
      if (saved) top.append(make("span", "campaign-content-state", copy.state(item.status)));
      card.append(top);
      const title = document.createElement("input"); title.type = "text"; title.maxLength = 240; title.value = item.title || "";
      title.placeholder = es() ? "Título (opcional)" : "Title (optional)"; title.disabled = !editable || item.saving; title.addEventListener("input", () => { item.title = title.value; markDirty(item, card); });
      card.append(field(title.placeholder, title));
      if (item.kind === "link") {
        const url = document.createElement("input"); url.type = "url"; url.inputMode = "url"; url.maxLength = 2000; url.value = item.link_url || ""; url.placeholder = "https://"; url.disabled = !editable || item.saving;
        url.addEventListener("input", () => { item.link_url = url.value; markDirty(item, card); updateLivePreview(); }); card.append(field(copy.link(), url));
      }
      const caption = document.createElement("textarea"); caption.maxLength = 10000; caption.rows = 4; caption.value = item.copy || ""; caption.disabled = !editable || item.saving;
      caption.setAttribute("aria-label", copy.caption()); caption.addEventListener("input", () => { item.copy = caption.value; markDirty(item, card); updateLivePreview(); });
      card.append(field(copy.caption(), caption));
      const choices = make("fieldset", "campaign-content-destinations"); choices.append(make("legend", "", copy.destinations()));
      const allowed = item.kind === "reel" ? ["instagram"] : item.kind === "photo" ? ["facebook", "instagram"] : ["facebook"];
      allowed.forEach((platform) => {
        const label = make("label", "campaign-content-destination");
        const input = document.createElement("input"); input.type = "checkbox"; input.dataset.destination = platform;
        input.checked = (item.platforms || []).includes(platform); input.disabled = !editable || item.saving;
        input.addEventListener("change", () => { item.platforms = [...card.querySelectorAll("[data-destination]:checked")].map((node) => node.dataset.destination); markDirty(item, card); });
        label.append(input, document.createTextNode(platform === "facebook" ? "Facebook" : "Instagram")); choices.append(label);
      });
      card.append(choices);
      const preview = make("div", "campaign-content-preview"); preview.append(make("strong", "", copy.preview()));
      const live = make("p", "campaign-content-live-preview"); preview.append(live);
      function updateLivePreview() { live.textContent = item.copy || (item.kind === "link" ? item.link_url : "") || (es() ? "Sin texto" : "No caption yet"); }
      updateLivePreview();
      if (item.file) {
        item.objectUrl = URL.createObjectURL(item.file);
        if (item.kind === "photo") { const image = document.createElement("img"); image.src = item.objectUrl; image.alt = item.file.name; preview.append(image); }
        else { const video = document.createElement("video"); video.src = item.objectUrl; video.controls = true; video.playsInline = true; video.setAttribute("aria-label", es() ? "Vista previa de Reel" : "Reel preview"); preview.append(video); }
      } else if (item.media?.url) {
        const mediaUrl = window.GMAuth.api + item.media.url;
        if (item.kind === "photo") { const image = document.createElement("img"); image.src = mediaUrl; image.alt = item.media.filename; preview.append(image); }
        else { const video = document.createElement("video"); video.src = mediaUrl; video.controls = true; video.playsInline = true; video.setAttribute("aria-label", es() ? "Vista previa de Reel" : "Reel preview"); preview.append(video); }
      } else preview.append(make("span", "campaign-content-file-pending", item.kind === "photo" || item.kind === "reel" ? copy.noFile() : (item.copy || item.link_url || copy.noFile())));
      card.append(preview);
      const actions = make("div", "campaign-content-actions");
      const save = make("button", "primary-link", copy.save());
      save.type = "button"; save.disabled = !editable || item.saving; save.addEventListener("click", () => saveItem(item)); actions.append(save);
      if (saved && item.status === "draft") { const b = make("button", "secondary-link", copy.review()); b.type = "button"; b.dataset.contentTransition = ""; b.disabled = !editable || item.dirty || Boolean(item.file) || item.saving; b.addEventListener("click", () => actionItem(item, "review")); actions.append(b); }
      if (saved && item.status === "review") { const b = make("button", "secondary-link", copy.approve()); b.type = "button"; b.dataset.contentTransition = ""; b.disabled = !editable || item.dirty || Boolean(item.file) || item.saving; b.addEventListener("click", () => actionItem(item, "approve")); actions.append(b); }
      if (saved && ["review", "approved"].includes(item.status)) { const b = make("button", "secondary-link", copy.return()); b.type = "button"; b.dataset.contentTransition = ""; b.disabled = !editable || item.dirty || Boolean(item.file) || item.saving; b.addEventListener("click", () => actionItem(item, "return")); actions.append(b); }
      if (saved) { const b = make("button", "content-remove-button", copy.remove()); b.type = "button"; b.disabled = !editable || item.saving; b.addEventListener("click", () => actionItem(item, "remove")); actions.append(b); }
      if (saved) {
        const b = make("button", "content-remove-button", copy.discard()); b.type = "button"; b.dataset.contentDiscard = ""; b.disabled = (!item.dirty && !item.file) || item.saving; b.addEventListener("click", () => discardChanges(item)); actions.append(b);
      } else {
        const b = make("button", "content-remove-button", copy.discard()); b.type = "button";
        b.addEventListener("click", () => { queue = queue.filter((entry) => entry !== item); render(); }); actions.append(b);
      }
      if (item.kind === "photo" || item.kind === "reel") {
        const input = document.createElement("input"); input.type = "file"; input.accept = item.kind === "photo" ? ".jpg,.jpeg,image/jpeg" : ".mp4,video/mp4";
        input.disabled = !editable || item.saving; input.setAttribute("aria-label", copy.chooseFile());
        input.addEventListener("change", () => { const file = input.files?.[0]; if (!file) return; if (!supported(item.kind, file)) { status(item, "unsupported"); input.value = ""; return; } item.file = file; item.dirty = true; render(); });
        actions.append(field(copy.chooseFile(), input));
      }
      card.append(actions);
      const message = make("p", "campaign-content-status", item.notice ? (copy[item.notice]?.() || "") : "");
      message.dataset.contentStatus = ""; message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite"); card.append(message);
      host.append(card);
    });
    document.querySelectorAll("[data-open-content-picker]").forEach((button) => { button.disabled = !editable || !campaignId; button.title = campaignId ? "" : copy.noCampaign(); });
    ["#add-text-draft", "#add-link-draft"].forEach((selector) => { const button = document.querySelector(selector); if (button) { button.disabled = !editable || !campaignId; button.title = campaignId ? "" : copy.noCampaign(); } });
    const reviewCount = document.querySelector("#campaign-review-count");
    if (reviewCount) reviewCount.textContent = es()
      ? items.length + " guardados: " + items.filter((item) => item.status === "draft").length + " borrador, " + items.filter((item) => item.status === "review").length + " en revisión, " + items.filter((item) => item.status === "approved").length + " aprobados."
      : items.length + " saved: " + items.filter((item) => item.status === "draft").length + " draft, " + items.filter((item) => item.status === "review").length + " in review, " + items.filter((item) => item.status === "approved").length + " approved.";
    const reviewLink = document.querySelector("#campaign-review-link");
    if (reviewLink) { reviewLink.href = campaignId ? "/workspace/campaigns/detail/?id=" + encodeURIComponent(campaignId) : "/workspace/campaigns/"; reviewLink.textContent = es() ? "Abrir y revisar contenido guardado" : "Open and review saved content"; }
    document.dispatchEvent(new CustomEvent("goodmarketing:content-count-change", { detail: { count: items.length } }));
  }
  function newDraft(kind, file) {
    const platforms = kind === "reel" ? ["instagram"] : kind === "photo" ? ["facebook", "instagram"] : ["facebook"];
    queue.push({ key: crypto.randomUUID(), kind, title: "", copy: "", link_url: "", platforms, file: file || null, status: "draft" }); render();
  }
  function snapshot(item) {
    return { kind: item.kind, title: item.title || "", copy: item.copy || "", link_url: item.link_url || "", platforms: [...(item.platforms || [])], status: item.status };
  }
  function titleFor(item) {
    if ((item.title || "").trim()) return item.title.trim();
    if (item.kind === "link" && item.link_url) { try { return new URL(item.link_url).hostname || "Link post"; } catch { return ""; } }
    if ((item.copy || "").trim()) return item.copy.trim().split(/\r?\n/)[0].slice(0, 240);
    return { text: "Text post", link: "Link post", photo: "Photo post", reel: "Reel" }[item.kind];
  }
  function matchesSaved(saved, item) {
    return saved.kind === item.kind && saved.title === titleFor(item) && saved.copy === (item.copy || "").trim() &&
      saved.link_url === (item.link_url || "").trim() && JSON.stringify(saved.platforms || []) === JSON.stringify(item.platforms || []);
  }
  async function load(id) {
    const requestedId = String(id);
    if (loadedCampaignId === requestedId) return;
    campaignId = requestedId; host.textContent = copy.loading();
    try {
      const response = await api("/workspace/campaigns/" + encodeURIComponent(campaignId) + "/content");
      if (!response.ok) throw new Error();
      const data = await response.json(); items = data.content.map((item) => ({ ...item, file: null, notice: "", dirty: false, savedSnapshot: snapshot(item) })); queue = []; loadedCampaignId = requestedId; render();
    } catch { host.textContent = copy.loadError(); }
  }
  function discardChanges(item) {
    Object.assign(item, item.savedSnapshot || {});
    item.file = null; item.dirty = false; item.notice = ""; render();
  }
  function options(method, item) {
    const headers = {};
    if (item.id) headers["If-Match"] = item.etag;
    else headers["Idempotency-Key"] = item.key;
    return { method, headers, body: JSON.stringify({ kind: item.kind, title: item.title, copy: item.copy, link_url: item.link_url || "", platforms: item.platforms }) };
  }
  async function recover(item, file, expectedStatus) {
    if (!item.id) return false;
    try {
      const response = await api("/workspace/content/" + encodeURIComponent(item.id));
      if (!response.ok) return false;
      const saved = (await response.json()).content;
      const currentEtag = response.headers.get("ETag");
      if (file) {
        if (saved.media?.sha256 && matchesSaved(saved, item)) {
          const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
          const hash = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
          if (hash === saved.media.sha256) {
            item.file = null; item.media = saved.media; item.etag = currentEtag || item.etag;
            item.status = saved.status; item.dirty = false; item.savedSnapshot = snapshot(saved); item.notice = "fileSaved"; return true;
          }
        }
        if (currentEtag && currentEtag !== item.etag) item.notice = "stale";
        return false;
      }
      if (matchesSaved(saved, item) && (!expectedStatus || saved.status === expectedStatus)) {
        item.etag = response.headers.get("ETag") || item.etag; item.status = saved.status; item.media = saved.media || item.media;
        item.dirty = false; item.savedSnapshot = snapshot(saved); item.notice = "saved"; return true;
      }
      item.notice = "stale";
    } catch { return false; }
    return false;
  }
  async function saveItem(item) {
    if (!canWrite() || !campaignId || item.saving) return;
    item.saving = true; status(item, "saving"); render();
    const wasSaved = Boolean(item.id);
    try {
      const response = await api(item.id ? "/workspace/content/" + encodeURIComponent(item.id) : "/workspace/campaigns/" + encodeURIComponent(campaignId) + "/content", options(item.id ? "PUT" : "POST", item));
      if (response.status === 412) { status(item, "stale"); return; }
      if (response.status === 422) { status(item, "invalid"); return; }
      if (!response.ok) throw new Error();
      const data = await response.json(); item.id = data.content.id; item.etag = response.headers.get("ETag") || data.content.etag || item.etag;
      item.status = data.content.status; item.media = data.content.media || item.media;
      item.title = data.content.title; item.dirty = false; item.savedSnapshot = snapshot(data.content);
      if (!wasSaved) { queue = queue.filter((entry) => entry !== item); items.push(item); }
      if (item.file && ["photo", "reel"].includes(item.kind)) {
        const file = item.file; status(item, "uploading"); render();
        const body = new FormData(); body.append("file", file, file.name);
        let response;
        try { response = await fetch(window.GMAuth.api + "/workspace/content/" + encodeURIComponent(item.id) + "/media", { method: "POST", credentials: "include", headers: { "If-Match": item.etag }, body }); }
        catch { const recovered = await recover(item, file); if (!recovered && item.notice !== "stale") status(item, "retry"); return; }
        if (response.status === 412) { status(item, "stale"); return; }
        if (response.status === 422) { status(item, "invalid"); return; }
        if (response.status === 413) {
          const detail = await response.json().catch(() => ({}));
          status(item, String(detail.detail || "").toLowerCase().includes("workspace") ? "quota" : "tooLarge");
          return;
        }
        if (!response.ok) { const recovered = await recover(item, file); if (!recovered && item.notice !== "stale") status(item, "retry"); return; }
        const data = await response.json(); item.etag = response.headers.get("ETag") || item.etag;
        item.media = data.content.media; item.status = data.content.status; item.file = null;
        item.dirty = false; item.savedSnapshot = snapshot(data.content);
      }
      item.notice = item.notice === "fileSaved" ? "fileSaved" : "saved";
    } catch {
      const recovered = await recover(item, item.file);
      if (!recovered && item.notice !== "stale") status(item, "retry");
    } finally { item.saving = false; render(); }
  }
  async function actionItem(item, action) {
    if (!canWrite() || item.saving) return;
    if (["review", "approve", "return"].includes(action) && (item.dirty || item.file)) return;
    if (action === "remove" && !window.confirm(es() ? "¿Eliminar este borrador y su archivo privado?" : "Remove this draft and its private file?")) return;
    item.saving = true; render();
    try {
      const path = "/workspace/content/" + encodeURIComponent(item.id) + (action === "remove" ? "" : "/" + action);
      const response = await api(path, { method: action === "remove" ? "DELETE" : "POST", headers: { "If-Match": item.etag } });
      if (response.status === 412) { status(item, "stale"); return; }
      if (!response.ok) { status(item, response.status === 422 ? "invalid" : "failed"); return; }
      if (action === "remove") items = items.filter((entry) => entry !== item);
      else { const data = (await response.json()).content; item.status = data.status; item.etag = response.headers.get("ETag") || item.etag; item.notice = "saved"; item.dirty = false; item.savedSnapshot = snapshot(data); }
    } catch {
      const expected = action === "review" ? "review" : action === "approve" ? "approved" : action === "return" ? "draft" : undefined;
      const recovered = await recover(item, null, expected);
      if (!recovered && item.notice !== "stale") status(item, "retry");
    }
    finally { item.saving = false; render(); }
  }
  document.querySelector("#add-text-draft")?.addEventListener("click", () => newDraft("text"));
  document.querySelector("#add-link-draft")?.addEventListener("click", () => newDraft("link"));
  document.querySelector("#content-assets")?.addEventListener("change", (event) => {
    const input = event.currentTarget; let unsupported = false;
    [...(input.files || [])].forEach((file) => {
      const kind = file.type === "image/jpeg" ? "photo" : file.type === "video/mp4" ? "reel" : "";
      if (!kind || !supported(kind, file)) { unsupported = true; return; }
      newDraft(kind, file);
    });
    input.value = "";
    if (unsupported) { const warning = make("p", "campaign-content-status", copy.unsupported()); warning.setAttribute("role", "status"); host.prepend(warning); }
  });
  document.querySelector("#remove-selected-content")?.addEventListener("click", () => { queue = []; render(); });
  document.addEventListener("goodmarketing:campaign-ready", (event) => load(event.detail.campaign.id));
  document.addEventListener("goodmarketing:account-ready", () => { if (campaignId) load(campaignId); else render(); });
  document.addEventListener("goodmarketing:language-change", () => render());
  if (window.GMAuth?.identity) { if (campaignId) load(campaignId); else render(); }
})();
