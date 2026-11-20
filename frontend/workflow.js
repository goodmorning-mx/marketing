(() => {
  const tabs = [...document.querySelectorAll(".workflow-tab")];
  const panel = document.querySelector("#workflow-panel");
  if (!tabs.length || !panel) return;

  const descriptions = [...panel.querySelectorAll("[data-workflow-description]")];

  if (window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) {
    document.querySelectorAll(".platforms, .research-visual, #workflow .strategy-control, #workflow .content-option, #workflow .publish-source, #workflow .publish-accounts").forEach((surface) => {
      let frame = 0;
      let clientX = 0;
      let clientY = 0;

      surface.addEventListener("pointermove", (event) => {
        clientX = event.clientX;
        clientY = event.clientY;
        if (frame) return;

        frame = requestAnimationFrame(() => {
          frame = 0;
          const bounds = surface.getBoundingClientRect();
          surface.style.setProperty("--mouse-x", `${clientX - bounds.left}px`);
          surface.style.setProperty("--mouse-y", `${clientY - bounds.top}px`);
        });
      }, { passive: true });

      surface.addEventListener("pointerleave", () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        surface.style.removeProperty("--mouse-x");
        surface.style.removeProperty("--mouse-y");
      }, { passive: true });
    });
  }

  function selectTab(tab, focus = false) {
    const key = tab.dataset.workflowTab;

    tabs.forEach((item) => {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
    });

    descriptions.forEach((description) => {
      description.hidden = description.dataset.workflowDescription !== key;
    });

    panel.setAttribute("aria-labelledby", tab.id);
    if (focus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;

      event.preventDefault();
      selectTab(tabs[nextIndex], true);
    });
  });

  const workflowSection = document.querySelector("#workflow");
  const brandTemplateDisclosure = document.querySelector(".brand-template-disclosure");
  const brandTemplatePanel = document.querySelector("#brand-template-panel");
  const brandTemplates = [...document.querySelectorAll("[data-brand-template-option]")];
  const strategyPlatforms = [...document.querySelectorAll("[data-strategy-platform]")];
  const strategyDuration = document.querySelector("#strategy-duration");
  const strategyDurationOutput = document.querySelector("[data-strategy-duration-output]");
  const strategyFrequencies = [...document.querySelectorAll('input[name="strategy-frequency"]')];
  const contentEstimateNumber = document.querySelector("[data-content-estimate-number]");
  const contentEstimateLabel = document.querySelector("[data-content-estimate-label]");
  const contentEstimateNote = document.querySelector("[data-content-estimate-note]");

  function updateBrandTemplateDisclosureLabel() {
    if (!brandTemplateDisclosure) return;
    const language = document.documentElement.lang === "es" ? "es" : "en";
    const expanded = brandTemplateDisclosure.getAttribute("aria-expanded") === "true";
    brandTemplateDisclosure.textContent = expanded
      ? (language === "es" ? "Ocultar plantillas" : "Hide Templates")
      : brandTemplateDisclosure.dataset[`label${language === "es" ? "Es" : "En"}`];
  }

  if (brandTemplateDisclosure && brandTemplatePanel) {
    brandTemplateDisclosure.addEventListener("click", () => {
      const expanded = brandTemplateDisclosure.getAttribute("aria-expanded") !== "true";
      brandTemplateDisclosure.setAttribute("aria-expanded", String(expanded));
      brandTemplatePanel.hidden = !expanded;
      updateBrandTemplateDisclosureLabel();
    });
  }

  brandTemplates.forEach((template) => {
    template.addEventListener("click", () => {
      workflowSection.dataset.brandTemplate = template.dataset.brandTemplateOption;
      brandTemplates.forEach((option) => {
        option.setAttribute("aria-pressed", String(option === template));
      });
    });
  });

  strategyPlatforms.forEach((platform) => {
    platform.addEventListener("click", () => {
      platform.setAttribute("aria-pressed", String(platform.getAttribute("aria-pressed") !== "true"));
      updateStrategyPlatformLabel(platform);
    });
  });

  function updateStrategyPlatformLabel(platform) {
    const language = document.documentElement.lang === "es" ? "es" : "en";
    const selected = platform.getAttribute("aria-pressed") === "true";
    const name = platform.dataset.strategyPlatform;
    const labels = {
      facebook: { en: "Facebook", es: "Facebook" },
      instagram: { en: "Instagram", es: "Instagram" },
      whatsapp: { en: "WhatsApp", es: "WhatsApp" },
      linkedin: { en: "LinkedIn", es: "LinkedIn" },
      tiktok: { en: "TikTok", es: "TikTok" },
      youtube: { en: "YouTube", es: "YouTube" }
    };
    const state = selected
      ? { en: "selected", es: "seleccionado" }
      : { en: "not selected", es: "no seleccionado" };
    platform.setAttribute("aria-label", `${labels[name][language]}, ${state[language]}`);
  }

  function formatStrategyDuration(days, language = document.documentElement.lang) {
    if (language === "es") return `${days} ${days === 1 ? "día" : "días"}`;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  function updateStrategyDuration() {
    if (!strategyDuration || !strategyDurationOutput) return;
    const language = document.documentElement.lang === "es" ? "es" : "en";
    const duration = formatStrategyDuration(Number(strategyDuration.value), language);
    strategyDurationOutput.textContent = duration;
    strategyDuration.setAttribute("aria-valuetext", duration);
  }

  function updateContentEstimate() {
    if (!strategyDuration || !contentEstimateNumber || !contentEstimateLabel || !contentEstimateNote) return;
    const language = document.documentElement.lang === "es" ? "es" : "en";
    const frequency = strategyFrequencies.find((option) => option.checked);
    const postsPerWeek = { low: 3, medium: 4, high: 5 }[frequency?.value] || 4;
    const days = Number(strategyDuration.value);
    const contentPieces = Math.ceil((postsPerWeek * days) / 7);
    contentEstimateNumber.textContent = new Intl.NumberFormat(language).format(contentPieces);
    contentEstimateLabel.textContent = language === "es"
      ? `pieza${contentPieces === 1 ? "" : "s"} de contenido`
      : `content piece${contentPieces === 1 ? "" : "s"}`;
    contentEstimateNote.textContent = language === "es"
      ? `Según ${postsPerWeek} publicaciones por semana durante ${days} ${days === 1 ? "día" : "días"}. Se redondea hacia arriba para cubrir toda la campaña.`
      : `Based on ${postsPerWeek} posts per week over ${formatStrategyDuration(days, "en")}. Rounded up to cover the full campaign.`;
  }

  if (strategyDuration) {
    strategyDuration.addEventListener("input", () => {
      updateStrategyDuration();
      updateContentEstimate();
    });
  }
  strategyFrequencies.forEach((frequency) => frequency.addEventListener("change", updateContentEstimate));

  function updateStrategyLanguage() {
    strategyPlatforms.forEach(updateStrategyPlatformLabel);
    updateStrategyDuration();
    updateContentEstimate();
  }

  document.addEventListener("goodmarketing:language-change", () => {
    updateStrategyLanguage();
    updateBrandTemplateDisclosureLabel();
  });
  selectTab(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0]);
  updateStrategyLanguage();
  updateBrandTemplateDisclosureLabel();
})();
