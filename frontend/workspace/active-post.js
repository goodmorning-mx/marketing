(() => {
  const card = document.querySelector(".metric-active-campaign");
  if (!card) return;

  const posts = {
    next: {
      date: ["Scheduled · Nov 21 · 13:30", "Programada · 21 nov · 13:30"],
      mediaType: ["Video", "Video"],
      image: "/workspace/assets/calendar/leopold-mechanics.mp4",
      poster: "/workspace/assets/calendar/leopold-mechanics-poster.png",
      alt: ["Leopold watch mechanism turning in close-up", "Mecanismo del reloj Leopold en movimiento, en primer plano"],
      title: ["Inside the movement", "El movimiento por dentro"],
      facebook: ["A closer look at the movement and craft behind the Leopold analog watch.", "Un vistazo más cercano al movimiento y la elaboración del reloj analógico Leopold."],
      instagram: ["Precision in motion. Take a closer look at the mechanics behind Leopold.", "Precisión en movimiento. Mira de cerca la mecánica detrás de Leopold."],
    },
    last: {
      date: ["Posted · Nov 20 · 10:00", "Publicada · 20 nov · 10:00"],
      mediaType: ["Photo", "Foto"],
      image: "/workspace/assets/calendar/leopold-analog-1.jpg",
      alt: ["Leopold analog watch with a digital date and battery display", "Reloj analógico Leopold con pantalla digital de fecha y batería"],
      title: ["First look: Leopold", "Primer vistazo: Leopold"],
      facebook: ["Meet Leopold. A bold analog design with a subtle digital readout for everyday life.", "Conoce Leopold. Un diseño analógico distintivo con una discreta lectura digital para todos los días."],
      instagram: ["Introducing Leopold: an analog watch designed around the details that matter. OCT 26 · 85%.", "Te presentamos Leopold: un reloj analógico diseñado alrededor de los detalles que importan. OCT 26 · 85%."],
    },
  };

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
    const locale = document.documentElement.lang === "es" ? 1 : 0;
    const post = posts[selectedView];
    const media = document.createElement(post.mediaType[0] === "Video" ? "video" : "img");
    media.className = "platform-post-media";
    media.setAttribute("aria-label", post.alt[locale]);
    if (post.mediaType[0] === "Video") {
      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
      media.poster = post.poster;
      media.src = post.image;
    } else {
      media.src = post.image;
      media.alt = post.alt[locale];
    }
    mediaFrame.replaceChildren(media, mediaType);
    if (window.GMPostPreview) window.GMPostPreview.apply(mediaFrame, media, selectedPlatform, post.mediaType[0] === "Video" ? "video" : "image");
    mediaType.textContent = post.mediaType[locale];
    status.textContent = post.date[locale];
    title.textContent = post.title[locale];
    caption.textContent = post[selectedPlatform][locale];
    views.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.postView === selectedView)));
    platforms.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.postPlatform === selectedPlatform)));
  }

  views.forEach((button) => button.addEventListener("click", () => {
    if (!posts[button.dataset.postView]) return;
    selectedView = button.dataset.postView;
    render();
  }));
  platforms.forEach((button) => button.addEventListener("click", () => {
    if (!["facebook", "instagram"].includes(button.dataset.postPlatform)) return;
    selectedPlatform = button.dataset.postPlatform;
    render();
  }));
  document.addEventListener("goodmarketing:language-change", render);
  render();
})();
