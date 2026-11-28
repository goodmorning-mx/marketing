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
      assetInvalid: "The palette or font file could not be accepted. Check its format and size, then try again.",
      noPalette: "Choose and preview a GIMP Palette before switching to custom colors.",
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
      assetInvalid: "No se pudo aceptar la paleta o tipografía. Revisa el formato y el tamaño e inténtalo de nuevo.",
      noPalette: "Elige y previsualiza una paleta GIMP antes de cambiar a colores personalizados.",
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
  const paletteInput = document.querySelector("#palette-file");
  const paletteName = document.querySelector("#palette-file-name");
  const paletteSwatches = document.querySelector("#palette-draft-swatches");
  const paletteUploadPreview = document.querySelector("#palette-upload-preview");
  const fontInput = document.querySelector("#font-files");
  const fontList = document.querySelector("#brand-font-list");
  const removePaletteButton = document.querySelector("#remove-custom-palette");
  let etag = null;
  let currentLogo = false;
  let removeLogo = false;
  let previewUrl = "";
  let currentColors = null;
  let templateColors = null;
  let effectiveColors = null;
  let statusKey = "";
  let previewSequence = 0;
  let ready = false;
  let paletteSource = "template";
  let paletteDraft = null;
  let customPalette = null;
  let fontState = [];
  let paletteSequence = 0;
  let activeFontFace = null;
  let palettePending = false;

  function say(key = "") {
    statusKey = key;
    if (status) status.textContent = key ? messages[language()][key] : "";
  }

  function setBusy(busy) {
    saveButton.disabled = busy || !ready || palettePending;
    if (logoInput) logoInput.disabled = busy;
    if (paletteInput) paletteInput.disabled = busy;
    if (fontInput) fontInput.disabled = busy;
    if (removePaletteButton) removePaletteButton.disabled = busy;
    if (removeButton) removeButton.disabled = busy;
    document.querySelectorAll("[data-palette-action], [data-font-action], [data-template-choice]").forEach((button) => { button.disabled = busy; });
    document.querySelectorAll("#palette-source-custom, #palette-source-template, #brand-font-list button, #brand-font-list input").forEach((control) => { control.disabled = busy; });
    if (reloadButton) reloadButton.disabled = busy;
  }

  function setFileName() {
    if (logoName) logoName.textContent = logoInput?.files?.[0]?.name || messages[language()].emptyLogo;
  }

  function setTemplate(templateKey, colors = null) {
    const key = templateKey || "goodmarketing";
    const button = [...document.querySelectorAll("[data-template-choice]")].find((item) => item.dataset.templateChoice === key);
    if (!button) return;
    templateColors = colors || button.dataset.colors.split(",");
    currentColors = templateColors;
    document.querySelectorAll("[data-template-choice]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    const name = document.querySelector("#template-preview-name");
    const tone = document.querySelector("#template-preview-tone");
    const swatch = document.querySelector("#template-preview-swatch");
    if (name) name.textContent = button.dataset.templateName;
    if (tone) tone.textContent = button.dataset[`tone${language() === "es" ? "Es" : "En"}`];
    paintTemplateSwatch(swatch, templateColors);
    if (paletteSource === "template") { effectiveColors = templateColors; paintSwatches(paletteSwatches, templateColors); }
  }

  function paintTemplateSwatch(node, colors) {
    if (!node) return;
    for (let index = 1; index <= 5; index++) node.style.removeProperty(`--template-color-${index}`);
    (colors || []).forEach((color, index) => node.style.setProperty(`--template-color-${index + 1}`, color.toUpperCase()));
  }

  function paintEffectiveColors() {
    const colors = paletteSource === "custom" ? (paletteDraft?.colors || customPalette?.colors || []) : templateColors;
    effectiveColors = colors;
    paintSwatches(paletteSwatches, colors);
  }

  function paintSwatches(node, colors) {
    if (!node) return;
    node.replaceChildren();
    (colors || []).forEach((color) => {
      const swatch = document.createElement("span");
      swatch.style.backgroundColor = color;
      swatch.setAttribute("aria-label", color);
      node.append(swatch);
    });
  }

  function drawFonts() {
    if (!fontList) return;
    fontList.replaceChildren();
    fontState.forEach((font, index) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = font.name || font.filename || "Brand font";
      item.append(name);
      if (font.action !== "remove") {
        const remove = document.createElement("button");
        remove.type = "button"; remove.dataset.fontAction = "remove"; remove.textContent = language() === "es" ? "Quitar" : "Remove";
        remove.addEventListener("click", () => { if (activeFontFace && font.id && activeFontFace.family === `BrandPreview-${font.id}`) { document.fonts.delete(activeFontFace); activeFontFace = null; const sample = document.querySelector("#font-preview-sample"); if (sample) sample.style.fontFamily = ""; } if (!font.id) fontState.splice(index, 1); else fontState[index].action = "remove"; drawFonts(); });
        item.append(remove);
        const replace = document.createElement("input");
        replace.type = "file"; replace.accept = ".woff,.woff2,.ttf,.otf"; replace.setAttribute("aria-label", language() === "es" ? `Reemplazar ${name.textContent}` : `Replace ${name.textContent}`);
        replace.addEventListener("change", () => { const file = replace.files?.[0]; if (!file) return; if (file.size > 1_048_576) { say("assetInvalid"); return; } fontState[index] = { id: font.id, name: file.name, filename: file.name, file, action: font.id ? "replace" : "add" }; drawFonts(); });
        item.append(replace);
        if (font.id && font.action === "keep") {
          const preview = document.createElement("button"); preview.type = "button"; preview.textContent = language() === "es" ? "Vista previa" : "Preview";
          preview.addEventListener("click", () => previewFont(font)); item.append(preview);
        }
      }
      fontList.append(item);
    });
  }

  async function previewFont(font) {
    try {
      const result = await window.GMAuth.request(`/workspace/brand-assets/fonts/${encodeURIComponent(font.id)}`);
      if (!result.ok) throw new Error("Font preview unavailable");
      const face = new FontFace(`BrandPreview-${font.id}`, await result.arrayBuffer());
      await face.load(); document.fonts.add(face);
      if (activeFontFace) document.fonts.delete(activeFontFace);
      activeFontFace = face;
      const sample = document.querySelector("#font-preview-sample");
      if (sample) sample.style.fontFamily = `"${face.family}"`;
    } catch { say("loadFailed"); }
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
    setTemplate(assets?.template_key || "goodmarketing", assets?.template_colors);
    paletteSource = assets?.palette_source || "template";
    customPalette = assets?.custom_palette || null;
    effectiveColors = assets?.colors || templateColors;
    paletteDraft = null;
    if (paletteInput) paletteInput.value = "";
    if (paletteName) paletteName.textContent = customPalette?.filename || (language() === "es" ? "Ninguna paleta seleccionada" : "No palette selected");
    paintSwatches(paletteUploadPreview, customPalette?.colors || []);
    document.querySelector("#palette-source-custom")?.setAttribute("aria-pressed", String(paletteSource === "custom"));
    document.querySelector("#palette-source-template")?.setAttribute("aria-pressed", String(paletteSource === "template"));
    if (removePaletteButton) removePaletteButton.hidden = !customPalette;
    paintEffectiveColors();
    fontState = (assets?.fonts || []).map((font) => ({ ...font, action: "keep" }));
    drawFonts();
    if (activeFontFace) { document.fonts.delete(activeFontFace); activeFontFace = null; }
    const fontSample = document.querySelector("#font-preview-sample");
    if (fontSample) fontSample.style.fontFamily = "";
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
      payload.palette_source = paletteSource;
      payload.palette_action = paletteDraft ? "replace" : customPalette?._remove ? "remove" : "keep";
      if (paletteDraft) { payload.palette_filename = paletteDraft.filename; payload.palette_base64 = await base64(paletteDraft.file); }
      payload.font_changes = [];
      for (const font of fontState) {
        if (font.action === "keep" || font.action === "remove") payload.font_changes.push({ action: font.action, id: font.id });
        else payload.font_changes.push({ action: font.action, ...(font.id ? { id: font.id } : {}), filename: font.file.name, base64: await base64(font.file) });
      }
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
      if (result.status === 422) { say(payload.font_changes?.some((change) => ["add", "replace"].includes(change.action)) || payload.palette_action === "replace" ? "assetInvalid" : "invalid"); return; }
      if (!result.ok) throw new Error("Asset save failed.");
      const data = await result.json();
      if (!data.assets || !result.headers.get("ETag")) throw new Error("Saved asset response is incomplete.");
      etag = result.headers.get("ETag");
      paletteSource = data.assets.palette_source || "template";
      customPalette = data.assets.custom_palette || null;
      paletteDraft = null;
      if (paletteInput) paletteInput.value = "";
      if (paletteName) paletteName.textContent = customPalette?.filename || (language() === "es" ? "Ninguna paleta seleccionada" : "No palette selected");
      paintSwatches(paletteUploadPreview, customPalette?.colors || []);
      document.querySelector("#palette-source-custom")?.setAttribute("aria-pressed", String(paletteSource === "custom"));
      document.querySelector("#palette-source-template")?.setAttribute("aria-pressed", String(paletteSource === "template"));
      if (removePaletteButton) removePaletteButton.hidden = !customPalette;
      fontState = (data.assets.fonts || []).map((font) => ({ ...font, action: "keep" }));
      drawFonts();
      setTemplate(data.assets.template_key || "goodmarketing", data.assets.template_colors);
      effectiveColors = data.assets.colors || templateColors;
      paintEffectiveColors();
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
  paletteInput?.addEventListener("change", async () => {
    const sequence = ++paletteSequence;
    const file = paletteInput.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024) { say("assetInvalid"); return; }
    palettePending = true; saveButton.disabled = true;
    try {
      const result = await window.GMAuth.request("/workspace/brand-assets/palette-preview", { method: "POST", body: JSON.stringify({ filename: file.name, base64: await base64(file) }) });
      if (sequence !== paletteSequence || paletteInput.files?.[0] !== file) return;
      if (!result.ok) throw new Error("Invalid palette");
      paletteDraft = { filename: file.name, file, colors: (await result.json()).colors };
      if (paletteName) paletteName.textContent = file.name;
      paintSwatches(paletteUploadPreview, paletteDraft.colors);
      if (paletteSource === "custom") paintEffectiveColors();
      say("fileSelected");
    } catch { if (sequence === paletteSequence) { paletteInput.value = ""; say("assetInvalid"); } }
    finally { if (sequence === paletteSequence) { palettePending = false; saveButton.disabled = !ready; } }
  });
  fontInput?.addEventListener("change", () => {
    const files = [...(fontInput.files || [])];
    if (files.some((file) => file.size > 1_048_576) || fontState.filter((font) => font.action !== "remove").length + files.length > 3) { say("assetInvalid"); fontInput.value = ""; return; }
    files.forEach((file) => fontState.push({ action: "add", filename: file.name, name: file.name, file }));
    fontInput.value = ""; drawFonts();
  });
  document.querySelector("#palette-source-custom")?.addEventListener("click", () => { if (!paletteDraft && !customPalette) { say("noPalette"); return; } paletteSource = "custom"; document.querySelector("#palette-source-custom").setAttribute("aria-pressed", "true"); document.querySelector("#palette-source-template").setAttribute("aria-pressed", "false"); paintEffectiveColors(); });
  document.querySelector("#palette-source-template")?.addEventListener("click", () => { paletteSource = "template"; document.querySelector("#palette-source-custom").setAttribute("aria-pressed", "false"); document.querySelector("#palette-source-template").setAttribute("aria-pressed", "true"); paintEffectiveColors(); });
  removePaletteButton?.addEventListener("click", () => { ++paletteSequence; palettePending = false; saveButton.disabled = !ready; paletteDraft = null; if (paletteInput) paletteInput.value = ""; customPalette = { ...(customPalette || {}), _remove: true }; paintSwatches(paletteUploadPreview, []); paletteSource = "template"; removePaletteButton.hidden = true; document.querySelector("#palette-source-template")?.setAttribute("aria-pressed", "true"); document.querySelector("#palette-source-custom")?.setAttribute("aria-pressed", "false"); paintEffectiveColors(); });
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
    if (paletteName) paletteName.textContent = paletteDraft?.filename || customPalette?.filename || (language() === "es" ? "Ninguna paleta seleccionada" : "No palette selected");
    const selected = [...document.querySelectorAll("[data-template-choice]")].find((button) => button.getAttribute("aria-pressed") === "true");
    if (selected) setTemplate(selected.dataset.templateChoice, templateColors);
    paintEffectiveColors();
    drawFonts();
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
