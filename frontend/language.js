(() => {
  const key = "goodmarketing-language";
  const supported = new Set(["en", "es"]);

  function applyLanguage(language) {
    const nextLanguage = supported.has(language) ? language : "en";
    const suffix = nextLanguage === "en" ? "En" : "Es";
    document.documentElement.lang = nextLanguage;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const translation = element.dataset[nextLanguage];
      if (translation !== undefined) element.textContent = translation;
    });
    document.querySelectorAll("[data-aria-en][data-aria-es]").forEach((element) => {
      element.setAttribute("aria-label", element.dataset["aria" + suffix]);
    });
    const title = document.querySelector("[data-title-en][data-title-es]");
    if (title) document.title = title.dataset["title" + suffix];
    const description = document.querySelector("meta[name='description'][data-description-en][data-description-es]");
    if (description) description.content = description.dataset["description" + suffix];
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.language === nextLanguage));
    });
    try { localStorage.setItem(key, nextLanguage); } catch { /* Keep the choice for this page. */ }
  }

  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.language));
  });
  let savedLanguage = "en";
  try { savedLanguage = localStorage.getItem(key) || "en"; } catch { /* Use English. */ }
  applyLanguage(savedLanguage);
})();
