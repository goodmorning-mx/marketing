(() => {
  const dial = document.querySelector(".research-stat-dial-progress");
  const graphic = dial?.closest(".research-stat-graphic");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!dial || !graphic || reduceMotion.matches) return;

  const animateDial = () => dial.classList.add("is-animating");

  if (!("IntersectionObserver" in window)) {
    animateDial();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      animateDial();
      observer.disconnect();
    }
  }, { threshold: 0.35 });

  observer.observe(graphic);
})();
