(() => {
  const core = document.querySelector(".campaign-core");
  const video = core?.querySelector(".campaign-core-animation");

  if (!core || !video) return;

  const showEndLogo = () => core.classList.add("is-complete");

  video.addEventListener("ended", showEndLogo, { once: true });
  video.addEventListener("error", showEndLogo, { once: true });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showEndLogo();
    return;
  }

  video.muted = true;
  video.play()?.catch(showEndLogo);
})();
