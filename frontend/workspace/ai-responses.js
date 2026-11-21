(() => {
  const storageKey = "goodmarketing-ai-response-review-v1";
  const locale = () => document.documentElement.lang === "es" ? "es" : "en";
  const copy = {
    en: {
      instagram: "Instagram", facebook: "Facebook", question: "Question", suggested: "AI response",
      approve: "Approve", edit: "Edit", save: "Save changes", cancel: "Cancel", approved: "Approved",
      emptyPending: "You’re all caught up. No responses need approval.", emptyLog: "Approved responses will appear here.",
      responseLabel: "Edit AI response", editQuestion: "Edit response for this question", approvalLabel: "Approve this response"
    },
    es: {
      instagram: "Instagram", facebook: "Facebook", question: "Pregunta", suggested: "Respuesta de IA",
      approve: "Aprobar", edit: "Editar", save: "Guardar cambios", cancel: "Cancelar", approved: "Aprobada",
      emptyPending: "Todo está al día. No hay respuestas que necesiten aprobación.", emptyLog: "Las respuestas aprobadas aparecerán aquí.",
      responseLabel: "Editar respuesta de IA", editQuestion: "Editar respuesta para esta pregunta", approvalLabel: "Aprobar esta respuesta"
    }
  };
  const seed = {
    pending: [
      {
        id: "instagram-hours", platform: "instagram",
        question: { en: "Are you open on Sundays?", es: "¿Abren los domingos?" },
        response: { en: "Yes! We’re open every Sunday from 10:00 AM to 4:00 PM. We’d love to see you.", es: "¡Sí! Abrimos todos los domingos de 10:00 a 16:00. Nos encantará verte." }
      },
      {
        id: "facebook-delivery", platform: "facebook",
        question: { en: "Do you deliver outside the city?", es: "¿Hacen entregas fuera de la ciudad?" },
        response: { en: "We deliver to select nearby areas. Send us your neighborhood by DM and we’ll confirm availability.", es: "Hacemos entregas en algunas zonas cercanas. Envíanos tu colonia por mensaje directo y confirmaremos la disponibilidad." }
      }
    ],
    approved: []
  };
  let state;
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    state = stored && Array.isArray(stored.pending) && Array.isArray(stored.approved) ? stored : structuredClone(seed);
  } catch {
    state = structuredClone(seed);
  }
  const editing = new Set();
  const persist = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Keep edits in memory for this page. */ }
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, action, className, ariaLabel) => {
    const node = element("button", className, label);
    node.type = "button";
    node.dataset.responseAction = action;
    if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
    return node;
  };
  const platformLabel = (platform) => copy[locale()][platform] || platform;

  function responseCard(item, approved) {
    const lang = locale();
    const text = copy[lang];
    const card = element("article", approved ? "response-item logged-response-item" : "response-item");
    card.dataset.responseId = item.id;
    const heading = element("div", "response-item-heading");
    heading.append(element("span", "response-platform", platformLabel(item.platform)));
    if (approved) heading.append(element("span", "response-approved", text.approved));
    card.append(heading);
    card.append(element("span", "response-field-label", text.question));
    card.append(element("p", "response-question", item.question[lang] || item.question.en));
    card.append(element("span", "response-field-label", text.suggested));

    const isEditing = editing.has(item.id);
    if (isEditing) {
      const textarea = element("textarea", "response-editor");
      textarea.value = item.response[lang] || item.response.en || "";
      textarea.setAttribute("aria-label", approved ? text.responseLabel : text.editQuestion);
      textarea.rows = 4;
      card.append(textarea);
      const actions = element("div", "response-actions");
      actions.append(button(text.save, "save", "response-save"));
      actions.append(button(text.cancel, "cancel", "response-cancel response-secondary"));
      card.append(actions);
    } else {
      card.append(element("p", "response-answer", item.response[lang] || item.response.en || ""));
      const actions = element("div", "response-actions");
      actions.append(button(text.edit, "edit", "response-secondary", text.editQuestion));
      if (!approved) actions.append(button(text.approve, "approve", "response-approve", text.approvalLabel));
      card.append(actions);
    }
    return card;
  }

  function renderReview() {
    const list = document.querySelector("#response-review-list");
    if (!list) return;
    list.replaceChildren();
    const count = document.querySelector("#response-pending-count");
    if (count) count.textContent = String(state.pending.length).padStart(2, "0");
    if (!state.pending.length) {
      list.append(element("p", "response-empty", copy[locale()].emptyPending));
      return;
    }
    state.pending.forEach((item) => list.append(responseCard(item, false)));
  }

  function renderLog() {
    const list = document.querySelector("#response-log-list");
    if (!list) return;
    list.replaceChildren();
    const count = document.querySelector("#response-log-count");
    if (count) count.textContent = String(state.approved.length);
    if (!state.approved.length) {
      list.append(element("p", "response-empty", copy[locale()].emptyLog));
      return;
    }
    state.approved.forEach((item) => list.append(responseCard(item, true)));
  }

  function handleAction(event) {
    const control = event.target.closest("[data-response-action]");
    if (!control) return;
    const card = control.closest("[data-response-id]");
    if (!card) return;
    const id = card.dataset.responseId;
    const action = control.dataset.responseAction;
    if (action === "edit") editing.add(id);
    if (action === "cancel") editing.delete(id);
    if (action === "save") {
      const item = [...state.pending, ...state.approved].find((entry) => entry.id === id);
      const textarea = card.querySelector("textarea");
      if (item && textarea) {
        item.response[locale()] = textarea.value.trim();
        persist();
      }
      editing.delete(id);
    }
    if (action === "approve") {
      const index = state.pending.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        const [item] = state.pending.splice(index, 1);
        state.approved.unshift({ ...item, approvedAt: new Date().toISOString() });
        persist();
      }
      editing.delete(id);
    }
    renderReview();
    renderLog();
  }

  document.querySelector("#response-review-list")?.addEventListener("click", handleAction);
  document.querySelector("#response-log-list")?.addEventListener("click", handleAction);
  function render() { renderReview(); renderLog(); }
  render();
  document.addEventListener("goodmarketing:language-change", render);
})();
