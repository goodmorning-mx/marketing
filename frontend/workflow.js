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

  const templateVoice = {
    goodmarketing: {
      en: {
        eyebrow: "Define the key messages and voice that guide the campaign.",
        intro: "The platform's purpose is to connect the steps so a team can see what's happening, what's waiting, and what comes next.",
        steps: {
          "brand-messaging": "Set the messages and voice that keep the campaign aligned with your brand.",
          strategy: "Set the campaign's direction, goals, and plan.",
          content: "Create campaign content or upload materials the team already has.",
          publish: "Schedule and coordinate the campaign's publishing across channels.",
          analysis: "Review what happened and use what the team learns to guide next steps."
        }
      },
      es: {
        eyebrow: "Define los mensajes clave y la voz que guían la campaña.",
        intro: "El propósito de la plataforma es conectar cada etapa para que el equipo vea qué sucede, qué está pendiente y qué sigue.",
        steps: {
          "brand-messaging": "Define los mensajes y la voz que mantienen la campaña alineada con tu marca.",
          strategy: "Define el rumbo, los objetivos y el plan de la campaña.",
          content: "Crea contenido para la campaña o sube materiales que el equipo ya tenga.",
          publish: "Programa y coordina la publicación de la campaña en distintos canales.",
          analysis: "Revisa los resultados y usa lo aprendido para orientar los siguientes pasos."
        }
      }
    },
    "night-pulse": {
      en: {
        eyebrow: "Build a campaign that feels clear, connected, and close to your community.",
        intro: "Bring each step together so your team can keep the conversation moving and know what comes next.",
        steps: {
          "brand-messaging": "Set a voice that feels warm, recognizable, and true to your brand.",
          strategy: "Choose a clear direction and goals your team can rally around.",
          content: "Create or upload content that feels welcoming and familiar.",
          publish: "Plan a steady rollout so your message reaches people at the right time.",
          analysis: "See what resonated and carry those lessons into your next campaign."
        }
      },
      es: {
        eyebrow: "Crea una campaña clara, conectada y cercana a tu comunidad.",
        intro: "Conecta cada etapa para que el equipo mantenga la conversación y sepa qué sigue.",
        steps: {
          "brand-messaging": "Define una voz cálida, reconocible y fiel a tu marca.",
          strategy: "Elige un rumbo claro y objetivos que unan al equipo.",
          content: "Crea o sube contenido acogedor y familiar.",
          publish: "Planea una distribución constante para que tu mensaje llegue en el momento adecuado.",
          analysis: "Identifica lo que conectó con la audiencia y lleva ese aprendizaje a tu próxima campaña."
        }
      }
    },
    "bright-bounce": {
      en: {
        eyebrow: "Give your campaign a bright voice and keep every step moving.",
        intro: "Make planning feel lighter, create with personality, and keep the whole team in sync.",
        steps: {
          "brand-messaging": "Add personality to your message while keeping it easy to recognize.",
          strategy: "Pick a clear goal, then rally your team around it.",
          content: "Create or upload lively content that gives your idea room to shine.",
          publish: "Keep good content moving with a coordinated rollout.",
          analysis: "Notice what caught people's attention and use it to guide your next idea."
        }
      },
      es: {
        eyebrow: "Dale una voz alegre a tu campaña y mantén cada etapa en movimiento.",
        intro: "Haz que la planeación sea más ligera, crea con personalidad y mantén al equipo coordinado.",
        steps: {
          "brand-messaging": "Añade personalidad al mensaje sin perder la claridad de tu marca.",
          strategy: "Elige un objetivo claro y anima al equipo a trabajar en él.",
          content: "Crea o sube contenido dinámico que dé espacio a tus ideas.",
          publish: "Mantén el contenido en movimiento con una distribución coordinada.",
          analysis: "Observa qué llamó la atención y usa ese aprendizaje en tu siguiente idea."
        }
      }
    },
    "clear-form": {
      en: {
        eyebrow: "A clear route from campaign plan to useful learning.",
        intro: "See each stage, the next action, and how the pieces fit together.",
        steps: {
          "brand-messaging": "Define the core message and voice in clear, consistent terms.",
          strategy: "Set the campaign direction, goals, and milestones.",
          content: "Create or upload the materials the campaign needs.",
          publish: "Schedule content across channels in an organized sequence.",
          analysis: "Review results and capture useful lessons for future planning."
        }
      },
      es: {
        eyebrow: "Un camino claro del plan de campaña al aprendizaje útil.",
        intro: "Consulta cada etapa, la siguiente acción y cómo se conectan las partes.",
        steps: {
          "brand-messaging": "Define el mensaje central y la voz con claridad y coherencia.",
          strategy: "Establece el rumbo, los objetivos y los hitos de la campaña.",
          content: "Crea o sube los materiales que necesita la campaña.",
          publish: "Programa el contenido en distintos canales de forma organizada.",
          analysis: "Revisa los resultados y registra aprendizajes útiles para planear después."
        }
      }
    },
    forward: {
      en: {
        eyebrow: "Move from message to action with a focused campaign plan.",
        intro: "Set the direction, coordinate publishing, and use results to decide what happens next.",
        steps: {
          "brand-messaging": "State the message, voice, and point of view clearly.",
          strategy: "Choose a goal and build a focused plan around it.",
          content: "Create or upload content that delivers the message.",
          publish: "Coordinate a timely rollout across your chosen channels.",
          analysis: "Review outcomes and act on what your team learns."
        }
      },
      es: {
        eyebrow: "Pasa del mensaje a la acción con un plan de campaña enfocado.",
        intro: "Define el rumbo, coordina las publicaciones y usa los resultados para decidir qué sigue.",
        steps: {
          "brand-messaging": "Expresa con claridad el mensaje, la voz y el punto de vista.",
          strategy: "Elige un objetivo y crea un plan enfocado para alcanzarlo.",
          content: "Crea o sube contenido que comunique el mensaje.",
          publish: "Coordina una distribución oportuna en los canales que elijas.",
          analysis: "Revisa los resultados y pon en práctica lo que aprenda el equipo."
        }
      }
    },
    "soft-focus": {
      en: {
        eyebrow: "Start with what matters to people, and build the campaign with care.",
        intro: "Connect each step around a thoughtful message and an audience-aware rollout.",
        steps: {
          "brand-messaging": "Choose words and a voice that feel considerate and true to your brand.",
          strategy: "Set goals with your audience and priorities in mind.",
          content: "Create or upload useful content people can connect with.",
          publish: "Coordinate a steady rollout across your channels.",
          analysis: "Listen to what resonated and carry that understanding forward."
        }
      },
      es: {
        eyebrow: "Empieza por lo que le importa a la gente y crea la campaña con cuidado.",
        intro: "Conecta cada etapa con un mensaje pensado para tu audiencia y una distribución cuidadosa.",
        steps: {
          "brand-messaging": "Elige palabras y una voz atentas y fieles a tu marca.",
          strategy: "Define objetivos considerando a tu audiencia y tus prioridades.",
          content: "Crea o sube contenido útil con el que la gente pueda conectar.",
          publish: "Coordina una distribución constante en tus canales.",
          analysis: "Presta atención a lo que conectó con la audiencia y sigue aprendiendo."
        }
      }
    },
    "loud-rebel": {
      en: {
        eyebrow: "Give the campaign a point of view, then carry it through every step.",
        intro: "Keep the message unmistakable, the rollout coordinated, and the next move informed by what you learn.",
        steps: {
          "brand-messaging": "Make your point of view bold, distinctive, and true to your brand.",
          strategy: "Set a clear goal and decide where to challenge convention.",
          content: "Create or upload content with a strong sense of personality.",
          publish: "Coordinate the rollout so your point of view lands consistently.",
          analysis: "See what sparked a response and let that shape the next move."
        }
      },
      es: {
        eyebrow: "Dale un punto de vista a la campaña y mantenlo en cada etapa.",
        intro: "Mantén un mensaje inconfundible, una distribución coordinada y un siguiente paso informado por lo que aprendas.",
        steps: {
          "brand-messaging": "Define un punto de vista audaz, distintivo y fiel a tu marca.",
          strategy: "Establece un objetivo claro y decide dónde romper con lo convencional.",
          content: "Crea o sube contenido con mucha personalidad.",
          publish: "Coordina la distribución para mantener tu punto de vista coherente.",
          analysis: "Observa qué provocó una respuesta y deja que eso guíe el siguiente paso."
        }
      }
    },
    "sunny-wit": {
      en: {
        eyebrow: "Make a clear plan, say what you mean, and leave the jargon out.",
        intro: "Give each step a job, keep the team aligned, and learn from what happens.",
        steps: {
          "brand-messaging": "Choose plain, memorable messages and a friendly brand voice.",
          strategy: "Pick a practical goal and map out the next steps.",
          content: "Create or upload useful content that sounds like your brand.",
          publish: "Schedule a coordinated rollout and keep things on track.",
          analysis: "See what worked, what didn't, and what to try next."
        }
      },
      es: {
        eyebrow: "Planea con claridad, di lo que quieres decir y deja fuera la jerga.",
        intro: "Dale un propósito a cada etapa, mantén al equipo alineado y aprende de los resultados.",
        steps: {
          "brand-messaging": "Elige mensajes sencillos y memorables, con una voz cercana.",
          strategy: "Define un objetivo práctico y traza los siguientes pasos.",
          content: "Crea o sube contenido útil que suene a tu marca.",
          publish: "Programa una distribución coordinada y mantén el plan en marcha.",
          analysis: "Revisa qué funcionó, qué no y qué puedes probar después."
        }
      }
    },
    "open-canvas": {
      en: {
        eyebrow: "Start with an honest message and let the campaign take shape.",
        intro: "Keep the steps connected, make room for new ideas, and see clearly what comes next.",
        steps: {
          "brand-messaging": "Find the words and voice that feel natural to your brand.",
          strategy: "Set a direction and leave room to adjust as you learn.",
          content: "Create or upload content that sounds like you.",
          publish: "Coordinate where and when each piece goes out.",
          analysis: "Look back honestly and use what you learn in the next campaign."
        }
      },
      es: {
        eyebrow: "Empieza con un mensaje sincero y deja que la campaña tome forma.",
        intro: "Conecta las etapas, haz espacio para nuevas ideas y ten claro qué sigue.",
        steps: {
          "brand-messaging": "Encuentra las palabras y la voz que se sientan naturales para tu marca.",
          strategy: "Define un rumbo y deja espacio para ajustarlo mientras aprendes.",
          content: "Crea o sube contenido que suene a ti.",
          publish: "Coordina dónde y cuándo se publica cada contenido.",
          analysis: "Revisa los resultados con honestidad y usa lo aprendido en tu próxima campaña."
        }
      }
    }
  };

  function applyTemplateVoice() {
    const template = workflowSection.dataset.brandTemplate;
    const language = document.documentElement.lang === "es" ? "es" : "en";
    const voice = templateVoice[template]?.[language] || templateVoice.goodmarketing[language];
    const eyebrow = workflowSection.querySelector(".section-heading > .eyebrow");
    const intro = workflowSection.querySelector(".section-heading p");
    const strategyIntro = workflowSection.querySelector("[data-strategy-intro]");
    if (eyebrow) eyebrow.textContent = voice.eyebrow;
    if (intro) intro.textContent = voice.intro;
    if (strategyIntro) strategyIntro.textContent = voice.steps.strategy;

    workflowSection.querySelectorAll("[data-workflow-tone-step]").forEach((element) => {
      element.textContent = voice.steps[element.dataset.workflowToneStep] || "";
    });
    descriptions.forEach((description) => {
      const key = description.dataset.workflowDescription;
      if (key === "content") {
        const contentIntro = description.querySelector("[data-workflow-content-intro]");
        if (contentIntro) contentIntro.textContent = voice.steps.content;
      } else if (key !== "brand-messaging" && key !== "strategy" && key !== "publish" && voice.steps[key]) {
        description.textContent = voice.steps[key];
      }
    });
  }

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
      applyTemplateVoice();
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
    applyTemplateVoice();
    updateStrategyLanguage();
    updateBrandTemplateDisclosureLabel();
  });
  applyTemplateVoice();
  updateStrategyLanguage();
  updateBrandTemplateDisclosureLabel();
})();
