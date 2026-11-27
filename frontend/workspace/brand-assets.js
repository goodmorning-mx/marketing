(() => {
  const language = () => document.documentElement.lang === "es" ? "es" : "en";
  const messages = {
    en: {
      loading: "Loading saved brand assets…",
      loaded: "Saved brand assets loaded.",
      loadFailed: "Could not load saved brand assets. Try again.",
      saving: "Saving brand assets…",
      saved: "Brand assets saved and confirmed.",
      savedPreviewFailed: "Brand assets are saved, but the logo preview could not load. Reload saved assets to retry.",
      saveFailed: "Could not save brand assets. Your changes are still here; try again.",
      invalid: "The logo could not be accepted. Check the format and size, then try again.",
      tooLarge: "The logo is too large. Choose a file no larger than 1 MB.",
      stale: "Brand assets changed in another session. Your choices are still here. Reload saved assets to review the latest version.",
      logoSaved: "Saved brand logo",
      emptyLogo: "No file selected",
      removed: "Saved logo will be removed when you save.",
      fileSelected: "Logo selected. Save brand assets to keep it.",
      reload: "Reload saved assets",
    },
    es: {
      loading: "Cargando recursos de marca guardados…",
      loaded: "Se cargaron los recursos de marca guardados.",
      loadFailed: "No se pudieron cargar los recursos de marca guardados. Inténtalo de nuevo.",
      saving: "Guardando recursos de marca…",
      saved: "Se guardaron y confirmaron los recursos de marca.",
      savedPreviewFailed: "Los recursos de marca se guardaron, pero no se pudo cargar la vista previa del logotipo. Carga los recursos guardados para reintentarlo.",
      saveFailed: "No se pudieron guardar los recursos de marca. Tus cambios siguen aquí; inténtalo de nuevo.",
      invalid: "No se pudo aceptar el logotipo. Revisa el formato y el tamaño e inténtalo de nuevo.",
      tooLarge: "El logotipo es demasiado grande. Elige un archivo de hasta 1 MB.",
      stale: "Los recursos de marca cambiaron en otra sesión. Tus opciones siguen aquí. Carga los recursos guardados para revisar la versión más reciente.",
      logoSaved: "Logotipo de marca guardado",
      emptyLogo: "Ningún archivo seleccionado",
      removed: "El logotipo guardado se quitará al guardar.",
      fileSelected: "Logotipo seleccionado. Guarda los recursos de marca para conservarlo.",
      reload: "Cargar recursos guardados",
    },
  };
  const form = document.querySelector("#brief-form");
  const assetsPanel = document.querySelector(".brand-assets");
  if (!form || !assetsPanel) return;

  const saveButton = document.querySelector("#save-brand-assets");
  const status = document.querySelector("#brand-assets-status");
  const logoInput = document.querySelector("#logo-file");
  const logoName = document.querySelector("#logo-file-name");
  const logoPreview = document.querySelector("#logo-preview");
  const removeButton = document.querySelector("#remove-brand-logo");
  const reloadButton = document.querySelector("#reload-brand-assets");
  let etag = null;
  let currentLogo = false;
  let removeLogo = false;
  let previewUrl = "";
  let currentColors = null;
  let statusKey = "";
  let previewSequence = 0;
  let ready = false;

  function say(key = "") {
    statusKey = key;
    if (status) status.textContent = key ? messages[language()][key] : "";
  }

  function setBusy(busy) {
    saveButton.disabled = busy || !ready;
    if (logoInput) logoInput.disabled = busy;
    if (removeButton) removeButton.disabled = busy;
    document.querySelectorAll("[data-template-choice]").forEach((button) => { button.disabled = busy; });
    if (reloadButton) reloadButton.disabled = busy;
  }

  function setFileName() {
    if (logoName) logoName.textContent = logoInput?.files?.[0]?.name || messages[language()].emptyLogo;
  }

  function setTemplate(templateKey, colors = null) {
    const key = templateKey || "goodmarketing";
    const button = [...document.querySelectorAll("[data-template-choice]")].find((item) => item.dataset.templateChoice === key);
    if (!button) return;
    currentColors = colors || button.dataset.colors.split(",");
    document.querySelectorAll("[data-template-choice]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    const name = document.querySelector("#template-preview-name");
    const tone = document.querySelector("#template-preview-tone");
    const swatch = document.querySelector("#template-preview-swatch");
    if (name) name.textContent = button.dataset.templateName;
    if (tone) tone.textContent = button.dataset[`tone${language() === "es" ? "Es" : "En"}`];
    currentColors.forEach((color, index) => swatch?.style.setProperty(`--template-color-${index + 1}`, color.toUpperCase()));
  }
  document.querySelectorAll("[data-template-choice]").forEach((button) => {
    button.addEventListener("click", () => setTemplate(button.dataset.templateChoice));
  });

  function releasePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }

  async function showDraftLogo(file, sequence) {
    if (!file || !logoPreview) return;
    const signatures = { "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff], "image/webp": [0x52, 0x49, 0x46, 0x46] };
    const expected = signatures[file.type];
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (sequence !== previewSequence) return;
    const valid = expected && expected.every((byte, index) => head[index] === byte) && (file.type !== "image/webp" || String.fromCharCode(...head.slice(8, 12)) === "WEBP");
    if (file.size > 1_048_576 || (!valid && file.type !== "image/svg+xml")) return;
    releasePreview();
    if (file.type === "image/svg+xml") { logoPreview.hidden = true; logoPreview.removeAttribute("src"); return; }
    previewUrl = URL.createObjectURL(file);
    logoPreview.src = previewUrl;
    logoPreview.alt = language() === "es" ? "Vista previa del logotipo seleccionado" : "Preview of selected logo";
    logoPreview.hidden = false;
  }

  async function showSavedLogo(hasLogo) {
    currentLogo = hasLogo;
    removeButton.hidden = !hasLogo;
    releasePreview();
    if (!logoPreview) return;
    if (!hasLogo) {
      logoPreview.hidden = true;
      logoPreview.removeAttribute("src");
      return;
    }
    try {
      const result = await window.GMAuth.request("/workspace/brand-assets/logo");
      if (!result.ok) throw new Error("Logo preview unavailable.");
      previewUrl = URL.createObjectURL(await result.blob());
      logoPreview.src = previewUrl;
      logoPreview.alt = messages[language()].logoSaved;
      logoPreview.hidden = false;
    } catch {
      logoPreview.hidden = true;
      logoPreview.removeAttribute("src");
      throw new Error("Saved logo preview could not be loaded.");
    }
  }

  async function loadAssets() {
    const result = await window.GMAuth.request("/workspace/brand-assets");
    if (!result.ok) throw new Error("Asset load failed.");
    const nextEtag = result.headers.get("ETag");
    const data = await result.json();
    if (!nextEtag) throw new Error("Saved asset version is missing.");
    etag = nextEtag;
    const assets = data.assets;
    setTemplate(assets?.template_key || "goodmarketing", assets?.colors);
    removeLogo = false;
    if (logoInput) logoInput.value = "";
    setFileName();
    await showSavedLogo(Boolean(assets?.logo));
    ready = true;
    if (reloadButton) reloadButton.hidden = true;
    if (saveButton) saveButton.disabled = false;
    return data.assets;
  }

  function base64(file) {
    return file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return btoa(binary);
    });
  }

  async function saveAssets() {
    if (!etag || saveButton.disabled) return;
    setBusy(true);
    say("saving");
    const file = logoInput?.files?.[0];
    const logoAction = removeLogo ? "remove" : file ? "replace" : "keep";
    const selected = [...document.querySelectorAll("[data-template-choice]")].find((button) => button.getAttribute("aria-pressed") === "true");
    const payload = { template_key: selected?.dataset.templateChoice || null, logo_action: logoAction };
    try {
      if (file) {
        if (file.size > 1_048_576) { say("tooLarge"); return; }
        const allowed = { "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff], "image/webp": [0x52, 0x49, 0x46, 0x46], "image/svg+xml": [0x3c] };
        const signature = allowed[file.type];
        const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const matches = signature && signature.every((byte, index) => head[index] === byte) && (file.type !== "image/webp" || String.fromCharCode(...head.slice(8, 12)) === "WEBP");
        if (!matches || (file.type === "image/svg+xml" && !new TextDecoder().decode(head).trimStart().startsWith("<"))) { say("invalid"); return; }
        payload.logo_media_type = file.type;
        payload.logo_base64 = await base64(file);
      }
      const result = await window.GMAuth.request("/workspace/brand-assets", {
        method: "PUT",
        headers: { "If-Match": etag },
        body: JSON.stringify(payload),
      });
      if (result.status === 412) {
        ready = false;
        if (reloadButton) reloadButton.hidden = false;
        say("stale");
        return;
      }
      if (result.status === 413) { say("tooLarge"); return; }
      if (result.status === 422) { say("invalid"); return; }
      if (!result.ok) throw new Error("Asset save failed.");
      const data = await result.json();
      if (!data.assets || !result.headers.get("ETag")) throw new Error("Saved asset response is incomplete.");
      etag = result.headers.get("ETag");
      setTemplate(data.assets?.template_key || "goodmarketing", data.assets?.colors);
      removeLogo = false;
      if (logoInput) logoInput.value = "";
      setFileName();
      try {
        await showSavedLogo(Boolean(data.assets?.logo));
        say("saved");
      } catch {
        if (reloadButton) reloadButton.hidden = false;
        say("savedPreviewFailed");
      }
    } catch {
      if (reloadButton) reloadButton.hidden = false;
      say("saveFailed");
    } finally {
      setBusy(false);
    }
  }

  logoInput?.addEventListener("change", () => {
    const sequence = ++previewSequence;
    removeLogo = false;
    setFileName();
    const file = logoInput.files?.[0];
    if (file) { showDraftLogo(file, sequence).catch(() => {}); say("fileSelected"); }
    else showSavedLogo(currentLogo).catch(() => {});
  });
  removeButton?.addEventListener("click", () => {
    previewSequence++;
    removeLogo = true;
    if (logoInput) logoInput.value = "";
    setFileName();
    releasePreview();
    if (logoPreview) { logoPreview.hidden = true; logoPreview.removeAttribute("src"); }
    removeButton.hidden = true;
    say("removed");
  });
  saveButton?.addEventListener("click", saveAssets);
  reloadButton?.addEventListener("click", async () => {
    setBusy(true);
    say("loading");
    try { await loadAssets(); say("loaded"); }
    catch { say("loadFailed"); }
    finally { setBusy(false); }
  });
  document.addEventListener("goodmarketing:language-change", () => {
    if (statusKey) say(statusKey);
    setFileName();
    const selected = [...document.querySelectorAll("[data-template-choice]")].find((button) => button.getAttribute("aria-pressed") === "true");
    if (selected) setTemplate(selected.dataset.templateChoice, currentColors);
    if (!logoPreview.hidden) logoPreview.alt = logoInput?.files?.[0]
      ? (language() === "es" ? "Vista previa del logotipo seleccionado" : "Preview of selected logo")
      : messages[language()].logoSaved;
  });

  async function start() {
    if (!window.GMAuth?.identity || !window.GMAuth.identity.roles.includes("owner")) return;
    setBusy(true);
    say("loading");
    try {
      await loadAssets();
      say("loaded");
      setBusy(false);
    } catch {
      setBusy(false);
      if (reloadButton) reloadButton.hidden = false;
      say("loadFailed");
    }
  }
  if (window.GMAuth?.identity) start();
  else document.addEventListener("goodmarketing:account-ready", (event) => {
    if (event.detail.identity.roles.includes("owner")) start();
  }, { once: true });
})();
