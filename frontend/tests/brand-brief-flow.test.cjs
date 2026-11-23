const assert = require("node:assert/strict");
const test = require("node:test");
const { createBrandBriefFlow } = require("../workspace/brand-brief-flow.js");

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
