(() => {
  const scene = document.querySelector('.hero-art');
  if (!scene) return;

  const items = [...scene.querySelectorAll('.channel-float[data-orbit-angle]')];
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compactPreference = window.matchMedia('(max-width: 900px)');
  const orbit = { width: 0, height: 0, start: 0, drag: null, visible: true, frame: 0 };
  const radians = degrees => (degrees * Math.PI) / 180;
  const easeOut = value => 1 - Math.pow(1 - value, 4);

  const measure = () => {
    const box = scene.getBoundingClientRect();
    orbit.width = box.width;
    orbit.height = box.height;
    paint(performance.now());
  };

  const tick = now => {
    orbit.frame = 0;
    paint(now);
  };

  const paint = now => {
    if (!orbit.width || !orbit.height) return;
    if (!orbit.start) orbit.start = now;

    const elapsed = now - orbit.start;
    const reduced = motionPreference.matches;
    const rotation = reduced ? 0 : elapsed * (Math.PI * 2 / 30000);
    const intro = reduced ? 1 : easeOut(Math.min(1, elapsed / 1100));
    const compact = compactPreference.matches;
    const radiusX = Math.min(orbit.width * (compact ? 0.42 : 0.39), 235);
    const radiusY = Math.min(orbit.height * (compact ? 0.3 : 0.31), 230);
    const tilt = radians(-8);

    items.forEach(item => {
      const startAngle = radians(Number(item.dataset.orbitAngle));
      const angle = startAngle + rotation + (1 - intro) * (radians(-90) - startAngle);
      const rawX = Math.cos(angle) * radiusX;
      const rawY = Math.sin(angle) * radiusY;
      const x = rawX * Math.cos(tilt) - rawY * Math.sin(tilt);
      const y = rawX * Math.sin(tilt) + rawY * Math.cos(tilt);
      const depth = Math.sin(angle);
      const scale = reduced ? 1 : 0.82 + ((depth + 1) / 2) * 0.24;
      const opacity = reduced ? 1 : 0.67 + ((depth + 1) / 2) * 0.33;

      item.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px), 0) scale(${scale.toFixed(3)})`;
      item.style.opacity = opacity.toFixed(3);
      const layer = depth < 0 ? '0' : '2';
      if (item.dataset.orbitLayer !== layer) {
        item.style.zIndex = layer;
        item.dataset.orbitLayer = layer;
      }
    });

    if (!reduced && orbit.visible && !document.hidden) {
      orbit.frame = requestAnimationFrame(tick);
    }
  };

  const wake = () => {
    if (!orbit.frame && orbit.visible && !motionPreference.matches && !document.hidden) {
      orbit.frame = requestAnimationFrame(tick);
    } else if (motionPreference.matches) {
      paint(performance.now());
    }
  };

  const observer = new IntersectionObserver(entries => {
    orbit.visible = entries[0].isIntersecting;
    if (orbit.visible) wake();
    else if (orbit.frame) {
      cancelAnimationFrame(orbit.frame);
      orbit.frame = 0;
    }
  }, { threshold: 0.05 });

  const resizeObserver = new ResizeObserver(measure);
  observer.observe(scene);
  resizeObserver.observe(scene);
  motionPreference.addEventListener?.('change', wake);
  document.addEventListener('visibilitychange', wake);
  measure();
  wake();
})();
