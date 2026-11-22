(() => {
  const card = document.querySelector(".metric-active-campaign");
  if (!card) return;
  const selectors = window.GoodMarketingCampaigns;
  const records = window.GoodMarketingDemoCampaigns;
  const view = window.GoodMarketingCampaignView;
  const views = [...card.querySelectorAll("[data-post-view]")];
  const platforms = [...card.querySelectorAll("[data-post-platform]")];
  const mediaFrame = card.querySelector("#active-post-media");
  const mediaType = card.querySelector("#active-post-media-type");
  const status = card.querySelector("#active-post-status");
  const title = card.querySelector("#active-post-title");
  const caption = card.querySelector("#active-post-caption");
  let selectedView = "next";
  let selectedPlatform = "instagram";

  function render() {
    if (!selectors || !records || !view) return;
    const spanish = document.documentElement.lang === "es";
    const summary = selectors.summarize(records, card.dataset.demoCampaign, view.asOf);
    const post = summary && selectors.postFor(summary, selectedView, selectedPlatform);
    views.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.postView === selectedView)));
    platforms.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.postPlatform === selectedPlatform)));
    mediaFrame.replaceChildren(mediaType);
    mediaFrame.hidden = !post;
    if (!post) {
      status.textContent = summary?.campaign.timeZone || "";
      title.textContent = selectedView === "next" ? (spanish ? "No hay publicaciones futuras elegibles." : "No eligible upcoming post.")
        : (spanish ? "No hay publicaciones confirmadas." : "No confirmed publication.");
      caption.textContent = spanish ? "Para esta plataforma en los registros de demostración." : "For this platform in the demo records.";
      return;
    }
    const variant = post.variant;
    const media = document.createElement(variant.mediaType === "video" ? "video" : "img");
    media.className = "platform-post-media";
    media.setAttribute("aria-label", view.text(variant.alt));
    if (variant.mediaType === "video") {
      media.controls = true; media.playsInline = true; media.preload = "metadata"; media.poster = variant.poster;
    } else media.alt = view.text(variant.alt);
    media.src = variant.src;
    mediaFrame.replaceChildren(media, mediaType);
    if (window.GMPostPreview) window.GMPostPreview.apply(mediaFrame, media, selectedPlatform, variant.mediaType);
    mediaType.textContent = variant.mediaType === "video" ? "Video" : (spanish ? "Foto" : "Photo");
    const state = selectedView === "last" ? (spanish ? "Publicación confirmada" : "Confirmed publication") : view.statusLabel(post.status);
    const partial = post.status === "partial" ? ` · ${view.statusLabel("partial")}` : "";
    status.textContent = `${state}${selectedView === "last" ? partial : ""} · ${selectors.formatDate(post.at, summary.campaign.timeZone, spanish ? "es-MX" : "en-US")} · ${selectors.formatTime(post.at, summary.campaign.timeZone)} · ${summary.campaign.timeZone}`;
    title.textContent = view.text(post.content.title);
    caption.textContent = view.text(variant.caption);
  }
  views.forEach((button) => button.addEventListener("click", () => {
    if (!["next", "last"].includes(button.dataset.postView)) return;
    selectedView = button.dataset.postView; render();
  }));
  platforms.forEach((button) => button.addEventListener("click", () => {
    if (!["facebook", "instagram"].includes(button.dataset.postPlatform)) return;
    selectedPlatform = button.dataset.postPlatform; render();
  }));
  document.addEventListener("goodmarketing:language-change", render);
  render();
})();
