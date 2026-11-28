(() => {
  const form = document.querySelector("#campaign-form");
  if (!form) return;
  const name = document.querySelector("#campaign-name");
  const objective = document.querySelector("#campaign-objective");
  const duration = document.querySelector("#strategy-duration");
  const status = document.createElement("p");
  status.id = "campaign-save-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  form.append(status);
  const button = document.querySelector("#save-campaign-draft");
  const spanish = () => document.documentElement.lang === "es";
  let statusKey = "";
  const copy = {
    loading: () => spanish() ? "Cargando campaña…" : "Loading campaign…",
    unavailableCampaign: () => spanish() ? "Esta campaña no está disponible." : "This campaign is unavailable.",
    unavailableField: () => spanish() ? "No disponible" : "Unavailable",
    legacy: () => spanish() ? "La duración o frecuencia anterior no está disponible; guarda solo valores conocidos o elige un valor nuevo." : "Legacy duration or frequency is unavailable; save only fields with known values unless you choose a new value.",
    saving: () => spanish() ? "Guardando borrador…" : "Saving campaign draft…",
    saved: () => spanish() ? "Se guardó el borrador." : "Campaign draft saved.",
    stale: () => spanish() ? "Esta campaña cambió en otra sesión. Tus cambios siguen aquí; recarga antes de guardar." : "This campaign changed in another session. Your edits are still here; reload before saving again.",
    invalid: () => spanish() ? "Revisa los campos e inténtalo de nuevo. Tus cambios siguen aquí." : "Review the campaign fields and try again. Your edits are still here.",
    failed: () => spanish() ? "No se pudo guardar la campaña. Tus cambios siguen aquí; inténtalo de nuevo." : "Could not save the campaign. Your edits are still here; try again.",
    required: () => spanish() ? "Escribe un nombre para guardar la campaña." : "Enter a campaign name to save the campaign.",
    setDuration: () => spanish() ? "Usar duración de 30 días" : "Set duration to 30 days",
    setFrequency: () => spanish() ? "Usar frecuencia media" : "Set medium frequency",
  };
  let editingId = new URLSearchParams(location.search).get("id");
  let etag = null, saving = false, requestId = crypto.randomUUID(), loadedCampaign = null, durationTouched = false, frequencyTouched = false, platformsTouched = false, readyToSave = !editingId, hydrating = false;
  duration?.addEventListener("input", () => { if (!hydrating) durationTouched = true; });
  document.querySelectorAll("[data-strategy-platform]").forEach((node) => node.addEventListener("click", () => { platformsTouched = true; }));
  document.querySelectorAll('input[name="strategy-frequency"]').forEach((node) => node.addEventListener("change", () => { frequencyTouched = true; }));
  const selectedPlatforms = () => [...document.querySelectorAll("[data-strategy-platform][aria-pressed=true]")].map((node) => node.dataset.strategyPlatform);
  const payload = () => ({ name: name.value.trim(), objective: objective.value.trim(), ...(!editingId || platformsTouched ? { platforms: selectedPlatforms() } : {}), ...(!editingId || durationTouched || loadedCampaign?.duration_days ? { duration_days: Number(duration.value) } : {}), ...(!editingId || frequencyTouched || loadedCampaign?.posting_frequency ? { posting_frequency: document.querySelector('input[name="strategy-frequency"]:checked')?.value || "medium" } : {}) });
  function addUnavailableChoice(parent, id, getLabel, activate) {
    const button = document.createElement("button"); button.type = "button"; button.id = id; button.className = "secondary-link"; button.textContent = getLabel();
    button.addEventListener("click", () => { button.remove(); activate(); }); parent.append(button);
    document.addEventListener("goodmarketing:language-change", () => { if (button.isConnected) button.textContent = getLabel(); });
  }
  async function loadForEdit() {
    statusKey = "loading"; status.textContent = copy.loading();
    try {
      const result = await GMAuth.request(`/workspace/campaigns/${encodeURIComponent(editingId)}`);
      if (!result.ok) throw new Error();
      const data = await result.json(); loadedCampaign = data.campaign; etag = result.headers.get("ETag");
      name.value = loadedCampaign.name; objective.value = loadedCampaign.objective || "";
      document.querySelectorAll("[data-strategy-platform]").forEach((node) => node.setAttribute("aria-pressed", String(loadedCampaign.platforms.includes(node.dataset.strategyPlatform))));
      const durationOutput = document.querySelector("[data-strategy-duration-output]");
      if (loadedCampaign.duration_days) {
        hydrating = true; duration.value = loadedCampaign.duration_days;
        duration.dispatchEvent(new Event("input", { bubbles: true })); hydrating = false;
      } else {
        duration.disabled = true; if (durationOutput) { durationOutput.textContent = copy.unavailableField(); duration.setAttribute("aria-valuetext", copy.unavailableField()); }
        const durationField = duration.closest("fieldset");
        addUnavailableChoice(durationField, "set-missing-duration", copy.setDuration, () => {
          duration.disabled = false; duration.value = "30"; hydrating = true; duration.dispatchEvent(new Event("input", { bubbles: true })); hydrating = false; durationTouched = true;
        });
      }
      const frequency = document.querySelector(`input[name="strategy-frequency"][value="${loadedCampaign.posting_frequency}"]`);
      const frequencyOptions = [...document.querySelectorAll('input[name="strategy-frequency"]')];
      if (frequency) frequency.checked = true;
      else {
        frequencyOptions.forEach((option) => { option.checked = false; option.disabled = true; });
        const frequencyField = document.querySelector(".strategy-frequency")?.closest("fieldset");
        addUnavailableChoice(frequencyField, "set-missing-frequency", copy.setFrequency, () => {
          frequencyOptions.forEach((option) => { option.disabled = false; });
          document.querySelector('input[name="strategy-frequency"][value="medium"]').checked = true;
          frequencyTouched = true;
        });
      }
      if (!loadedCampaign.duration_days || !loadedCampaign.posting_frequency) {
        const info = document.createElement("p"); info.id = "campaign-legacy-note"; info.textContent = copy.legacy(); form.prepend(info);
      }
      statusKey = ""; status.textContent = "";
      readyToSave = true; if (button) button.disabled = false;
    } catch { statusKey = "unavailableCampaign"; status.textContent = copy.unavailableCampaign(); if (button) button.disabled = true; }
  }
  async function save({ navigate = true } = {}) {
    if (saving || !readyToSave) return;
    if (!name.value.trim()) { name.setAttribute("aria-invalid", "true"); const error = document.querySelector("#campaign-name-error"); if (error) error.hidden = false; statusKey = ""; status.textContent = ""; name.focus(); return; }
    name.removeAttribute("aria-invalid");
    saving = true; button.disabled = true; statusKey = "saving"; status.textContent = copy.saving();
    try {
      const data = payload();
      const result = await GMAuth.request(editingId ? `/workspace/campaigns/${encodeURIComponent(editingId)}` : "/workspace/campaigns", {
        method: editingId ? "PUT" : "POST", headers: { ...(editingId ? { "If-Match": etag } : { "Idempotency-Key": requestId }) }, body: JSON.stringify(data)
      });
      if (result.status === 412) { statusKey = "stale"; throw new Error(copy.stale()); }
      if (result.status === 422) { statusKey = "invalid"; throw new Error(copy.invalid()); }
      if (result.status === 409 && !editingId) {
        const conflict = await result.json().catch(() => ({}));
        const campaignId = conflict?.detail?.campaign_id;
        status.replaceChildren(document.createTextNode(spanish() ? "Esta solicitud ya creó otro borrador. Tus cambios siguen aquí. " : "This save request already created a different draft. Your edits are still here. "));
        if (campaignId) { const link = document.createElement("a"); link.href = `/workspace/campaigns/detail/?id=${encodeURIComponent(campaignId)}`; link.textContent = spanish() ? "Abrir borrador guardado" : "Open saved draft"; status.append(link); }
        statusKey = ""; return;
      }
      if (!result.ok) { statusKey = "failed"; throw new Error(copy.failed()); }
      const saved = (await result.json()).campaign;
      statusKey = "saved";
      status.textContent = copy.saved();
      if (navigate) {
        try { sessionStorage.setItem("gm-campaign-navigation-status", JSON.stringify({ workspace: GMAuth.identity.organization_id, id: String(saved.id), path: "/workspace/campaigns/detail/", message: "saved" })); } catch {}
        location.assign(`/workspace/campaigns/detail/?id=${encodeURIComponent(saved.id)}`);
      }
      else {
        editingId = String(saved.id); etag = result.headers.get("ETag"); loadedCampaign = saved; requestId = crypto.randomUUID();
        history.replaceState(null, "", `/workspace/new-campaign/?id=${encodeURIComponent(saved.id)}`);
        document.dispatchEvent(new CustomEvent("goodmarketing:campaign-ready", { detail: { campaign: saved } }));
        window.GMShowCampaignStep?.(2);
      }
    } catch (error) {
      if (error.message === copy.stale()) statusKey = "stale";
      else if (error.message === copy.invalid()) statusKey = "invalid";
      else if (error.message === copy.failed() || error.message === "Failed to fetch" || statusKey === "saving") statusKey = "failed";
      status.textContent = statusKey ? copy[statusKey]() : error.message;
    }
    finally { saving = false; button.disabled = false; }
  }
  button?.addEventListener("click", () => save({ navigate: true }));
  window.GMCampaignBuilder = { saveAndContinue: () => save({ navigate: false }), campaignId: () => editingId };
  if (editingId && button) button.disabled = true;
  document.addEventListener("goodmarketing:account-ready", () => { if (editingId) loadForEdit(); });
  document.addEventListener("goodmarketing:language-change", () => {
    if (statusKey) status.textContent = copy[statusKey]();
    const note = document.querySelector("#campaign-legacy-note"); if (note) note.textContent = copy.legacy();
    const durationOutput = document.querySelector("[data-strategy-duration-output]");
    if (editingId && loadedCampaign && !loadedCampaign.duration_days && duration.disabled && durationOutput) { durationOutput.textContent = copy.unavailableField(); duration.setAttribute("aria-valuetext", copy.unavailableField()); }
  });
})();
