(() => {
  const tabs = [...document.querySelectorAll(".workflow-tab")];
  const panel = document.querySelector("#workflow-panel");
  if (!tabs.length || !panel) return;

  const descriptions = [...panel.querySelectorAll("[data-workflow-description]")];

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
})();
