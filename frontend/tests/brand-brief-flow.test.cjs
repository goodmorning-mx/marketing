const assert = require("node:assert/strict");
const test = require("node:test");
const { createBrandBriefFlow } = require("../workspace/brand-brief-flow.js");
const { renderBrandBriefFeedbackLanguage } = require("../workspace/brand-brief-feedback.js");

const fields = ["brand_name", "description", "audience", "voice_tone", "primary_goal"];
const brief = (overrides = {}) => ({
  id: 17,
  brand_name: "Example brand",
  description: "Original description",
  audience: "Original audience",
  voice_tone: "Clear tone",
  primary_goal: "Original goal",
  revision: 1,
  ...overrides,
});
const response = (status, value, tag) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => name === "ETag" ? tag : null },
  json: async () => value,
});

function setup(handler) {
  const inputs = {};
  const calls = [];
  const statuses = [];
  const conflicts = [];
  const editability = [];
  let reloads = 0;
  const flow = createBrandBriefFlow({
    fields,
    request: async (path, options = {}) => {
      calls.push({ path, options });
      return handler(path, options, calls.length);
    },
    readDraft: () => ({ ...inputs }),
    applyBrief: (value) => fields.forEach((field) => { inputs[field] = value ? value[field] : ""; }),
    setEditable: (enabled) => editability.push(enabled),
    onStatus: (status) => statuses.push(status),
    onLoaded: () => {},
    beforeReload: () => true,
    onConfirmed: () => { reloads += 1; },
    onConflict: (value) => conflicts.push(value),
  });
  return { flow, inputs, calls, statuses, conflicts, editability, get reloads() { return reloads; } };
}

function typeWhenEnabled(harness, field, value) {
  if (harness.editability.at(-1)) harness.inputs[field] = value;
}

test("committed save keeps fields locked through a failed confirmation GET and retries with GET only", async () => {
  const saved = brief({ description: "Committed description", revision: 2 });
  const h = setup(async (_path, options, index) => {
    if (index === 1) return response(200, { brief: null }, "empty-tag");
    if (index === 2) return response(200, { brief: saved }, "saved-tag");
    if (index === 3) throw new Error("confirmation connection lost");
    if (index === 4) return response(200, { brief: saved }, "saved-tag");
    throw new Error("unexpected request");
  });
  await h.flow.load();
  const draft = { brand_name: "New brand", description: "Committed description", audience: "Small shops", voice_tone: "Friendly", primary_goal: "Launch" };
  fields.forEach((field) => { h.inputs[field] = draft[field]; });

  await h.flow.save();
  assert.equal(h.flow.getState().phase, "confirm-pending");
  assert.equal(h.editability.at(-1), false);
  typeWhenEnabled(h, "description", "Newer text typed during recovery");
  assert.equal(h.inputs.description, draft.description);

  await h.flow.retryRecovery();
  assert.deepEqual(h.calls.map((call) => call.options.method || "GET"), ["GET", "PUT", "GET", "GET"]);
  assert.equal(h.reloads, 1);
  assert.deepEqual(h.inputs, Object.fromEntries(fields.map((field) => [field, saved[field]])));
});

test("failed bootstrap stays locked until a GET retry reloads the brief", async () => {
  const h = setup(async (_path, _options, index) => {
    if (index === 1) throw new Error("bootstrap GET failed");
    if (index === 2) return response(200, { brief: brief() }, "current-tag");
    throw new Error("unexpected request");
  });
  assert.equal(await h.flow.load(), false);
  assert.equal(h.flow.getState().phase, "load-error");
  assert.equal(h.editability.at(-1), false);
  assert.equal(h.statuses.at(-1), "load-error");
  assert.equal(await h.flow.load(), true);
  assert.equal(h.editability.at(-1), true);
  assert.deepEqual(h.calls.map((call) => call.options.method || "GET"), ["GET", "GET"]);
});

test("lost PUT plus failed recovery GET keeps the draft locked and retries only GET", async () => {
  const draft = { brand_name: "New brand", description: "Draft retained", audience: "Small shops", voice_tone: "Friendly", primary_goal: "Launch" };
  const h = setup(async (_path, options, index) => {
    if (index === 1) return response(200, { brief: null }, "empty-tag");
    if (index === 2) throw new TypeError("lost PUT response");
    if (index === 3) throw new Error("recovery GET failed");
    if (index === 4) return response(200, { brief: { ...brief(), ...draft, revision: 2 } }, "new-tag");
    throw new Error("unexpected request");
  });
  await h.flow.load();
  fields.forEach((field) => { h.inputs[field] = draft[field]; });
  await h.flow.save();
  assert.equal(h.flow.getState().phase, "unknown-pending");
  assert.equal(h.editability.at(-1), false);
  typeWhenEnabled(h, "description", "Newer unsaved text");
  assert.equal(h.inputs.description, draft.description);

  await h.flow.retryRecovery();
  assert.deepEqual(h.calls.map((call) => call.options.method || "GET"), ["GET", "PUT", "GET", "GET"]);
  assert.equal(h.flow.getState().phase, "ready");
  assert.equal(h.statuses.at(-1), "outcome-current");
  assert.equal(h.reloads, 0);
  assert.equal(h.inputs.description, draft.description);
});

test("delayed recovery rejects overlapping retries and cannot issue duplicate writes", async () => {
  const saved = brief({ description: "Saved", revision: 2 });
  let resolveRetry;
  const delayedGet = new Promise((resolve) => { resolveRetry = resolve; });
  const h = setup(async (_path, options, index) => {
    if (index === 1) return response(200, { brief: null }, "empty-tag");
    if (index === 2) return response(200, { brief: saved }, "saved-tag");
    if (index === 3) throw new Error("first confirmation GET failed");
    if (index === 4) return delayedGet;
    throw new Error("unexpected request");
  });
  await h.flow.load();
  const draft = { brand_name: "New brand", description: "Saved", audience: "Small shops", voice_tone: "Friendly", primary_goal: "Launch" };
  await h.flow.save(draft, "empty-tag");
  assert.equal(h.flow.getState().phase, "confirm-pending");

  const retry = h.flow.retryRecovery();
  assert.equal(h.flow.getState().phase, "confirming");
  assert.equal(await h.flow.retryRecovery(), false);
  assert.equal(await h.flow.save({ ...draft, description: "duplicate" }, "saved-tag"), false);
  typeWhenEnabled(h, "description", "Newer typing");
  resolveRetry(response(200, { brief: saved }, "saved-tag"));
  await retry;

  assert.equal(h.calls.filter((call) => call.options.method === "PUT").length, 1);
  assert.equal(h.calls.filter((call) => !call.options.method || call.options.method === "GET").length, 3);
  assert.equal(h.reloads, 1);
});

test("conflict choices use the displayed validator and stale actions cannot replace current draft", async () => {
  const server = brief({ description: "Other tab description", audience: "Other tab audience", revision: 2 });
  const draft = { brand_name: "Example brand", description: "My description", audience: "My audience", voice_tone: "Clear tone", primary_goal: "Original goal" };
  const final = { ...server, description: "Merged description", audience: "My audience", revision: 3 };
  const h = setup(async (_path, options, index) => {
    if (index === 1) return response(200, { brief: brief() }, "etag-one");
    if (index === 2) return response(412, { detail: "stale" }, null);
    if (index === 3) return response(200, { brief: server }, "etag-two");
    if (index === 4) return response(200, { brief: final }, "etag-three");
    if (index === 5) return response(200, { brief: final }, "etag-three");
    throw new Error("unexpected request");
  });
  await h.flow.load();
  fields.forEach((field) => { h.inputs[field] = draft[field]; });
  await h.flow.save();
  const shown = h.conflicts[0];
  assert.equal(shown.serverBrief.description, server.description);
  assert.equal(shown.draft.description, draft.description);
  assert.equal(h.calls.filter((call) => call.options.method === "PUT").length, 1);

  assert.equal(await h.flow.chooseConflict(shown.id, "keep-draft"), true);
  assert.equal(h.flow.getState().etag, "etag-two");
  typeWhenEnabled(h, "description", "Merged description");
  typeWhenEnabled(h, "audience", "My audience");
  assert.equal(await h.flow.chooseConflict(shown.id, "load-server"), false);
  assert.equal(h.inputs.description, "Merged description");
  await h.flow.save();
  const puts = h.calls.filter((call) => call.options.method === "PUT");
  assert.equal(puts[1].options.headers["If-Match"], "etag-two");
  assert.equal(JSON.parse(puts[1].options.body).description, "Merged description");
});

test("explicit replacement is conditional on the server version shown in the comparison", async () => {
  const server = brief({ description: "Other tab", revision: 2 });
  const draft = { brand_name: "Example brand", description: "Replace this", audience: "My audience", voice_tone: "Clear tone", primary_goal: "Original goal" };
  const h = setup(async (_path, options, index) => {
    if (index === 1) return response(200, { brief: brief() }, "etag-one");
    if (index === 2) return response(412, { detail: "stale" }, null);
    if (index === 3) return response(200, { brief: server }, "etag-two");
    if (index === 4) return response(200, { brief: { ...server, ...draft, revision: 3 } }, "etag-three");
    if (index === 5) return response(200, { brief: { ...server, ...draft, revision: 3 } }, "etag-three");
    throw new Error("unexpected request");
  });
  await h.flow.load();
  fields.forEach((field) => { h.inputs[field] = draft[field]; });
  await h.flow.save();
  const shown = h.conflicts[0];
  await h.flow.chooseConflict(shown.id, "replace-draft");
  const puts = h.calls.filter((call) => call.options.method === "PUT");
  assert.equal(puts.length, 2);
  assert.equal(puts[1].options.headers["If-Match"], "etag-two");
  assert.deepEqual(JSON.parse(puts[1].options.body), draft);
  assert.equal(h.reloads, 1);
});

function languageHarness(handler) {
  const inputs = Object.fromEntries(fields.map((field) => [field, ""]));
  const calls = [];
  const editable = [];
  const view = { messageNode: null, messageKey: null, actions: [], labels: [], fieldLabels: [], readFieldLabel: (field) => `EN ${field}` };
  const en = { confirmPending: "Checking saved values", unknownConflict: "Unknown save result", staleConflict: "Server changed", retryLoad: "Check server again", loadServer: "Load server", keepDraft: "Keep draft", replaceDraft: "Replace server", serverVersion: "Server version", yourDraft: "Your draft" };
  const es = { confirmPending: "Comprobando valores guardados", unknownConflict: "Resultado de guardado desconocido", staleConflict: "El servidor cambió", retryLoad: "Consultar servidor", loadServer: "Cargar servidor", keepDraft: "Conservar borrador", replaceDraft: "Reemplazar servidor", serverVersion: "Versión del servidor", yourDraft: "Tu borrador" };
  let currentLanguage = en;
  let flow;
  const clear = () => { view.messageNode = null; view.messageKey = null; view.actions = []; view.labels = []; view.fieldLabels = []; };
  const render = () => renderBrandBriefFeedbackLanguage(view, (key) => currentLanguage[key]);
  const setMessage = (key) => { clear(); view.messageKey = key; view.messageNode = { textContent: "" }; render(); };
  const addAction = (key, action) => { const node = { textContent: "", click: action }; view.actions.push({ node, key }); render(); return node; };
  flow = createBrandBriefFlow({
    fields,
    request: async (path, options = {}) => { calls.push({ path, options }); return handler(path, options, calls.length); },
    readDraft: () => ({ ...inputs }),
    applyBrief: (value) => fields.forEach((field) => { inputs[field] = value ? value[field] : ""; }),
    setEditable: (enabled) => editable.push(enabled),
    onStatus: (status) => {
      if (status === "confirm-pending") { setMessage("confirmPending"); addAction("retryLoad", () => flow.retryRecovery()); }
      else if (status === "unknown-pending") { setMessage("unknownConflict"); addAction("retryLoad", () => flow.retryRecovery()); }
      else if (status === "stale-pending") { setMessage("staleConflict"); addAction("retryLoad", () => flow.retryRecovery()); }
      else if (status === null) clear();
    },
    onLoaded: () => {}, beforeReload: () => true, onConfirmed: () => {},
    onConflict: (context) => {
      setMessage(context.cause === "unknown" ? "unknownConflict" : "staleConflict");
      view.labels = [{ node: { textContent: "" }, key: "serverVersion" }, { node: { textContent: "" }, key: "yourDraft" }];
      view.fieldLabels = fields.map((field) => ({ node: { textContent: "" }, field }));
      context.comparison = { server: { ...context.serverBrief }, draft: { ...context.draft } };
      if (context.allowRetryOriginal) addAction("retryLoad", () => flow.chooseConflict(context.id, "retry-original"));
      else {
        addAction("loadServer", () => flow.chooseConflict(context.id, "load-server"));
        addAction("keepDraft", () => flow.chooseConflict(context.id, "keep-draft"));
        addAction("replaceDraft", () => flow.chooseConflict(context.id, "replace-draft"));
      }
    },
  });
  return { flow, inputs, calls, editable, view, en, es, renderIn(language) { currentLanguage = language; render(); } };
}

test("language changes preserve the failed-confirmation Retry action and locked draft", async () => {
  const saved = brief({ description: "Committed text", revision: 2 });
  const h = languageHarness(async (_path, _options, index) => {
    if (index === 1) return response(200, { brief: brief() }, "etag-one");
    if (index === 2) return response(200, { brief: saved }, "etag-two");
    if (index === 3) throw new Error("confirmation GET unavailable");
    if (index === 4) return response(200, { brief: saved }, "etag-two");
    throw new Error("unexpected request");
  });
  await h.flow.load();
  const draft = { brand_name: "Brand", description: "Committed text", audience: "Small stores", voice_tone: "Warm", primary_goal: "A long goal" };
  Object.assign(h.inputs, draft);
  await h.flow.save();
  const retry = h.view.actions[0].node;
  h.inputs.description = "Typed value must remain";
  h.renderIn(h.es);
  assert.equal(h.view.messageNode.textContent, h.es.confirmPending);
  assert.equal(h.view.actions[0].node, retry);
  assert.equal(retry.textContent, h.es.retryLoad);
  assert.equal(h.inputs.description, "Typed value must remain");
  await retry.click();
  assert.deepEqual(h.calls.map((call) => call.options.method || "GET"), ["GET", "PUT", "GET", "GET"]);
  assert.deepEqual(h.inputs, Object.fromEntries(fields.map((field) => [field, saved[field]])));
});

test("language changes preserve unknown-outcome Retry without repeating PUT or losing the draft", async () => {
  const draft = { brand_name: "Brand", description: "Unsure draft", audience: "Small stores", voice_tone: "Warm", primary_goal: "A long goal" };
  const h = languageHarness(async (_path, _options, index) => {
    if (index === 1) return response(200, { brief: brief() }, "etag-one");
    if (index === 2 || index === 3) throw new Error(index === 2 ? "lost PUT response" : "recovery GET unavailable");
    if (index === 4) return response(200, { brief: { ...brief(), ...draft, revision: 2 } }, "etag-two");
    throw new Error("unexpected request");
  });
  await h.flow.load();
  Object.assign(h.inputs, draft);
  await h.flow.save();
  const retry = h.view.actions[0].node;
  h.inputs.description = "Draft survives language switch";
  h.renderIn(h.es); h.renderIn(h.en);
  assert.equal(h.view.actions[0].node, retry);
  assert.equal(retry.textContent, h.en.retryLoad);
  assert.equal(h.inputs.description, "Draft survives language switch");
  await retry.click();
  assert.deepEqual(h.calls.map((call) => call.options.method || "GET"), ["GET", "PUT", "GET", "GET"]);
  assert.equal(h.inputs.description, draft.description);
  assert.equal(h.flow.getState().phase, "ready");
});

test("language changes preserve stale comparison and explicit choices until the user acts", async () => {
  const server = brief({ description: "Server copy", audience: "Server audience", revision: 2 });
  const draft = { brand_name: "Brand", description: "Draft copy", audience: "Draft audience", voice_tone: "Warm", primary_goal: "A long goal" };
  const h = languageHarness(async (_path, _options, index) => {
    if (index === 1) return response(200, { brief: brief() }, "etag-one");
    if (index === 2) return response(412, { detail: "stale" }, null);
    if (index === 3) return response(200, { brief: server }, "etag-two");
    if (index === 4) return response(200, { brief: { ...server, ...draft, revision: 3 } }, "etag-three");
    if (index === 5) return response(200, { brief: { ...server, ...draft, revision: 3 } }, "etag-three");
    throw new Error("unexpected request");
  });
  await h.flow.load();
  Object.assign(h.inputs, draft);
  await h.flow.save();
  const conflict = h.flow.getState().conflict;
  const actionNodes = h.view.actions.map(({ node }) => node);
  const comparisons = conflict && { server: { ...conflict.serverBrief }, draft: { ...conflict.draft } };
  h.renderIn(h.es);
  assert.deepEqual(h.view.actions.map(({ node }) => node), actionNodes);
  assert.deepEqual(h.view.labels.map(({ node }) => node.textContent), [h.es.serverVersion, h.es.yourDraft]);
  assert.deepEqual(comparisons.server.description, "Server copy");
  assert.deepEqual(comparisons.draft.description, "Draft copy");
  assert.equal(h.flow.getState().etag, "etag-one");
  assert.equal(conflict.serverTag, "etag-two");
  assert.equal(h.calls.filter((call) => call.options.method === "PUT").length, 1);
  await h.view.actions.find(({ key }) => key === "keepDraft").node.click();
  assert.equal(h.flow.getState().etag, "etag-two");
  assert.equal(h.inputs.description, draft.description);
  await h.flow.save();
  assert.deepEqual(h.calls.filter((call) => call.options.method === "PUT").map((call) => call.options.headers["If-Match"]), ["etag-one", "etag-two"]);
});
