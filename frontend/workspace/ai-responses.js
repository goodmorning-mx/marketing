(() => {
  const storageKey = "goodmarketing-ai-response-review-v1";
  const locale = () => document.documentElement.lang === "es" ? "es" : "en";
  const copy = {
    en: {
      instagram: "Instagram", facebook: "Facebook", question: "Question", suggested: "AI response",
      approve: "Approve", edit: "Edit", save: "Save changes", cancel: "Cancel", approved: "Approved",
      emptyPending: "No example responses need approval.", emptyLog: "Approved example responses will appear here.",
      responseLabel: "Edit AI response", editQuestion: "Edit response for this question", approvalLabel: "Approve this response",
      required: "Enter a response before saving.", storageReadError: "Saved responses couldn’t be read. Showing examples for this visit; the saved queue is unchanged.",
      readOnlyNotice: "This change applies to these examples for this visit only. The saved queue was not read or changed.",
      storageWriteError: "Couldn’t save this change. It will last only until you leave this page.",
      approvedNotice: (count) => count ? `Example response approved. ${count} still need approval.` : "Example response approved. The demo queue is empty.",
      savedNotice: "Example response saved in this browser.", canceledNotice: "Unsaved edits discarded."
    },
    es: {
      instagram: "Instagram", facebook: "Facebook", question: "Pregunta", suggested: "Respuesta de IA",
      approve: "Aprobar", edit: "Editar", save: "Guardar cambios", cancel: "Cancelar", approved: "Aprobada",
      emptyPending: "No hay respuestas de ejemplo que necesiten aprobación.", emptyLog: "Las respuestas de ejemplo aprobadas aparecerán aquí.",
      responseLabel: "Editar respuesta de IA", editQuestion: "Editar respuesta para esta pregunta", approvalLabel: "Aprobar esta respuesta",
      required: "Escribe una respuesta antes de guardar.", storageReadError: "No se pudieron leer las respuestas guardadas. Se mostrarán ejemplos durante esta visita; la cola guardada no se modificó.",
      readOnlyNotice: "Este cambio solo se aplica a estos ejemplos durante esta visita. La cola guardada no se leyó ni se modificó.",
      storageWriteError: "No se pudo guardar el cambio. Solo estará disponible hasta que salgas de esta página.",
      approvedNotice: (count) => count ? `Respuesta de ejemplo aprobada. Quedan ${count} por aprobar.` : "Respuesta de ejemplo aprobada. La cola de demostración está vacía.",
      savedNotice: "Respuesta de ejemplo guardada en este navegador.", canceledNotice: "Se descartaron los cambios sin guardar."
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
  let storageError = "";
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    state = stored && Array.isArray(stored.pending) && Array.isArray(stored.approved) ? stored : structuredClone(seed);
  } catch {
    state = structuredClone(seed);
    storageError = "read";
  }
  let queueNotice = storageError === "read" ? "storageReadError" : "";
  const editing = new Set();
  const drafts = new Map();
  const draftKey = (id, lang) => `${id}:${lang}`;
  const persist = () => {
    if (storageError === "read") return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      storageError = "";
      return true;
    } catch {
      storageError = "write";
      return false;
    }
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
      textarea.value = drafts.has(draftKey(item.id, lang)) ? drafts.get(draftKey(item.id, lang)) : (item.response[lang] || item.response.en || "");
      textarea.setAttribute("aria-label", approved ? text.responseLabel : text.editQuestion);
      textarea.rows = 4;
      card.append(textarea);
      const feedback = element("p", "response-validation", copy[lang].required);
      feedback.setAttribute("role", "alert");
      feedback.hidden = true;
      card.append(feedback);
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
    const status = document.querySelector("#response-review-status");
    if (status) {
      const currentCopy = copy[locale()];
      status.textContent = typeof queueNotice === "string" && queueNotice
        ? currentCopy[queueNotice]
        : queueNotice ? currentCopy[queueNotice.key](queueNotice.count)
          : storageError === "read" ? currentCopy.storageReadError : storageError === "write" ? currentCopy.storageWriteError : "";
    }
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
    const lang = locale();
    queueNotice = "";
    if (action === "edit") editing.add(id);
    if (action === "cancel") {
      editing.delete(id);
      drafts.delete(draftKey(id, lang));
    }
    if (action === "save") {
      const item = [...state.pending, ...state.approved].find((entry) => entry.id === id);
      const textarea = card.querySelector("textarea");
      if (item && textarea && !textarea.value.trim()) {
        const feedback = card.querySelector(".response-validation");
        if (feedback) feedback.hidden = false;
        textarea.focus();
        return;
      }
      if (item && textarea) {
        item.response[lang] = textarea.value.trim();
        drafts.delete(draftKey(id, lang));
        queueNotice = persist() ? "savedNotice" : storageError === "read" ? "readOnlyNotice" : "storageWriteError";
      }
      editing.delete(id);
    }
    if (action === "approve") {
      const index = state.pending.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        const [item] = state.pending.splice(index, 1);
        state.approved.unshift({ ...item, approvedAt: new Date().toISOString() });
        queueNotice = persist()
          ? { key: "approvedNotice", count: state.pending.length }
          : storageError === "read" ? "readOnlyNotice" : "storageWriteError";
      }
      editing.delete(id);
    }
    if (action === "cancel") queueNotice = "canceledNotice";
    renderReview();
    renderLog();
    if (action === "edit") document.querySelector(`[data-response-id="${CSS.escape(id)}"] textarea`)?.focus();
    if (action === "cancel" || action === "save") document.querySelector(`[data-response-id="${CSS.escape(id)}"] [data-response-action="edit"]`)?.focus();
  }

  function handleInput(event) {
    const textarea = event.target.closest(".response-editor");
    if (!textarea) return;
    const card = textarea.closest("[data-response-id]");
    if (card) drafts.set(draftKey(card.dataset.responseId, locale()), textarea.value);
  }

  document.querySelector("#response-review-list")?.addEventListener("click", handleAction);
  document.querySelector("#response-log-list")?.addEventListener("click", handleAction);
  document.querySelector("#response-review-list")?.addEventListener("input", handleInput);
  document.querySelector("#response-log-list")?.addEventListener("input", handleInput);
  function render() { renderReview(); renderLog(); }
  render();
  document.addEventListener("goodmarketing:language-change", render);
})();
