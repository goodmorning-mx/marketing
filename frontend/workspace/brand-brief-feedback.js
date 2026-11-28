(function (root) {
  function renderBrandBriefFeedbackLanguage(view, translate) {
    if (view.messageNode && view.messageKey) view.messageNode.textContent = translate(view.messageKey);
    view.actions.forEach(({ node, key }) => { node.textContent = translate(key); });
    view.labels.forEach(({ node, key }) => { node.textContent = translate(key); });
    view.fieldLabels.forEach(({ node, field }) => { node.textContent = view.readFieldLabel(field); });
  }

  const api = { renderBrandBriefFeedbackLanguage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GMBrandBriefFeedback = api;
})(typeof window !== "undefined" ? window : globalThis);
