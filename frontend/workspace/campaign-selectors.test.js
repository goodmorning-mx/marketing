const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const records = require("./demo-campaigns.js");
const selectors = require("./campaign-selectors.js");
const asOf = "2026-11-22T18:00:00Z";
const id = "winter-campaign";
const clone = () => structuredClone(records);
const summary = (data = records, at = asOf) => selectors.summarize(data, id, at);
const nextId = summary().nextPost.id;
const lastId = summary().lastPost.id;

test("November 22 projection agrees with the shared Calendar records and UTC instants", () => {
  const result = summary();
  assert.equal(result.campaign.status, "active");
  assert.equal(result.planningProgress, null);
  assert.equal(result.upcomingCount, 2);
  assert.equal(result.overdueCount, 1);
  assert.equal(result.publishedContentCount, 1);
  assert.equal(result.confirmedDeliveryCount, 2);
  assert.equal(result.nextPost.at, "2026-11-24T21:00:00.000Z");
  assert.equal(result.lastPost.at, "2026-11-20T16:00:00.000Z");
  assert.equal(selectors.formatTime(result.nextPost.at, result.campaign.timeZone), "15:00");
  assert.equal(selectors.formatTime(result.lastPost.at, result.campaign.timeZone), "10:00");
  assert.deepEqual(result.remaining, { days: 26, phase: "running" });
  const calendar = selectors.calendar(records, { campaignId: id, asOf });
  assert.equal(calendar.days["2026-11-21"][0].status, "overdue");
  assert.equal(calendar.days["2026-11-24"][1].id, result.nextPost.id);
  assert.equal(calendar.days["2026-11-20"][0].id, result.lastPost.id);
  assert.equal(calendar.events.filter((item) => item.type === "content").length, 4);
  assert.equal(calendar.events.filter((item) => item.type !== "content").length, 2);
});

test("fixture is deeply read-only and selectors do not mutate caller records", () => {
  assert.ok(Object.isFrozen(records));
  assert.ok(Object.isFrozen(records.contentItems[0].variants[0].caption));
  const data = clone(); const before = structuredClone(data);
  summary(data); selectors.calendar(data, { asOf });
  assert.deepEqual(data, before);
  assert.equal(records.source, "demo");
});

test("retries and duplicate occurrence rows do not duplicate posts or confirmed deliveries", () => {
  const data = clone();
  const success = data.publishJobs.find((job) => job.occurrenceId === lastId);
  data.publishJobs.push({ ...success, id: "retry-success", attempt: 2 });
  data.publishJobs.push({ ...success, id: "later-failed-attempt", attempt: 3, status: "failed", publishedAt: null });
  data.occurrences.push({ ...data.occurrences.find((row) => row.id === lastId) });
  const result = summary(data);
  assert.equal(result.publishedContentCount, 1);
  assert.equal(result.confirmedDeliveryCount, 2);
  assert.equal(result.occurrences.length, 4);
  assert.equal(result.lastPost.at, summary().lastPost.at);
  assert.equal(result.upcomingCount, 2);
});

test("partial publication stays partial and next/last honor the selected platform", () => {
  const data = clone();
  const job = data.publishJobs.find((job) => job.occurrenceId === nextId && job.platform === "instagram");
  Object.assign(job, { status: "published", publishedAt: "2026-11-22T17:00:00Z" });
  const result = summary(data);
  assert.equal(result.nextPost.status, "partial");
  assert.equal(result.nextPost.complete, false);
  assert.equal(result.partialCount, 1);
  assert.equal(result.publishedContentCount, 2); // distinct content with at least one explicit confirmation
  assert.equal(result.confirmedDeliveryCount, 3);
  assert.equal(result.upcomingCount, 2);
  assert.notEqual(selectors.postFor(result, "next", "instagram").id, nextId);
  assert.equal(selectors.postFor(result, "next", "facebook").id, nextId);
  assert.equal(selectors.postFor(result, "last", "instagram").at, job.publishedAt);
  const event = selectors.calendar(data, { campaignId: id, asOf }).events.find((event) => event.id === nextId);
  assert.equal(event.status, "partial");
  assert.deepEqual(event.platforms.map((platform) => platform.status), ["posted", "scheduled"]);
});

test("cancelled, fully blocked and completed occurrences cannot be next", () => {
  for (const state of ["cancelled", "blocked"]) {
    const data = clone();
    data.occurrences.find((row) => row.id === nextId).status = state;
    const result = summary(data);
    assert.notEqual(result.nextPost.id, nextId);
    assert.equal(result.upcomingCount, 1);
    if (state === "blocked") {
      const event = selectors.calendar(data, { campaignId: id, asOf }).events.find((event) => event.id === nextId);
      assert.equal(event.status, "blocked"); assert.ok(event.platforms.every((platform) => platform.status === "blocked"));
    }
  }
  const data = clone();
  data.publishJobs.filter((job) => job.occurrenceId === nextId).forEach((job) => { job.status = "blocked"; });
  assert.notEqual(summary(data).nextPost.id, nextId);
  assert.equal(summary(data).upcomingCount, 1);
  data.publishJobs.find((job) => job.occurrenceId === nextId).status = "scheduled";
  assert.equal(summary(data).nextPost.id, nextId); // one blocked platform does not block another eligible platform
  assert.notEqual(summary().nextPost.id, lastId);
});

test("missing and future publication confirmations never use created_at or scheduled time", () => {
  const data = clone();
  data.publishJobs.filter((job) => job.occurrenceId === lastId).forEach((job) => {
    job.publishedAt = null;
    job.created_at = "2026-11-22T17:00:00Z";
  });
  assert.equal(summary(data).lastPost, null);
  assert.equal(summary(data).publishedContentCount, 0);
  data.publishJobs.filter((job) => job.occurrenceId === lastId).forEach((job) => { job.publishedAt = "2026-11-25T16:00:00Z"; });
  assert.equal(summary(data).lastPost, null);
  data.occurrences.find((row) => row.id === nextId).scheduledAt = null;
  assert.notEqual(summary(data).nextPost.id, nextId);
  assert.equal(summary(data).upcomingCount, 1);
  assert.equal(selectors.instant("2026-11-24T15:00:00"), null);
  assert.equal(selectors.instant("2026-11-24"), null);
  assert.equal(selectors.instant(null), null);
});

test("no eligible future post and no confirmed publication have explicit null states", () => {
  const data = clone();
  data.occurrences.forEach((row) => { row.status = "cancelled"; });
  assert.equal(summary(data).nextPost, null);
  assert.equal(summary(data).upcomingCount, 0);
  assert.equal(summary(data).overdueCount, 0);
  data.publishJobs.forEach((job) => { job.publishedAt = null; job.status = "blocked"; });
  assert.equal(summary(data).lastPost, null);
  assert.equal(summary(data).publishedContentCount, 0);
});

test("campaign filtering happens before grouping; unknown ID cannot expose another campaign", () => {
  const data = clone();
  data.campaigns.push({ ...data.campaigns[0], id: "second-campaign", name: "Second campaign", timeZone: "America/New_York" });
  data.contentItems.push({ ...data.contentItems[0], id: "second-content", campaignId: "second-campaign" });
  data.occurrences.push({ id: "second-occurrence", contentId: "second-content", status: "scheduled", scheduledAt: "2026-11-24T04:30:00Z" });
  const filtered = selectors.calendar(data, { campaignId: id, asOf });
  assert.ok(filtered.events.every((event) => event.campaignId === id));
  assert.deepEqual(summary(data).nextPost, summary().nextPost);
  const second = selectors.calendar(data, { campaignId: "second-campaign", asOf });
  assert.equal(second.timeZone, "America/New_York");
  assert.equal(second.days["2026-11-23"][0].id, "second-occurrence");
  const all = selectors.calendar(data, { asOf });
  assert.equal(all.timeZone, "America/Mexico_City");
  assert.equal(all.events.find((event) => event.id === "second-occurrence").campaignName, "Second campaign");
  const missing = selectors.calendar(data, { campaignId: "missing", asOf });
  assert.equal(missing.notFound, true); assert.deepEqual(missing.events, []); assert.deepEqual(missing.days, {});
  assert.equal(selectors.summarize(data, "missing", asOf), null);
});

test("one fixture edit feeds summary, next-post display and Calendar without duplicated titles", () => {
  const data = clone();
  const item = data.contentItems.find((item) => item.id === summary().nextPost.contentId);
  item.title.en = "Shared fixture verification";
  data.occurrences.find((row) => row.id === nextId).scheduledAt = "2026-11-25T21:00:00Z";
  const result = summary(data);
  assert.equal(result.nextPost.content.title.en, item.title.en);
  assert.equal(selectors.postFor(result, "next", "instagram").content.title.en, item.title.en);
  const event = selectors.calendar(data, { campaignId: id, asOf }).days["2026-11-25"][0];
  assert.equal(event.title.en, item.title.en);
  assert.equal(event.id, result.nextPost.id);
  for (const file of ["active-post.js", "workspace.js", "index.html", "campaigns/index.html", "campaigns/winter-campaign/index.html"]) {
    assert.ok(!fs.readFileSync(path.join(__dirname, file), "utf8").includes(item.title.en));
    assert.ok(!fs.readFileSync(path.join(__dirname, file), "utf8").includes("Readability, reimagined"), file);
  }
});

test("remaining days use campaign dates excluding today with ended and not-started states", () => {
  assert.equal(summary(records, "2026-11-22T04:00:00Z").remaining.days, 27); // still Nov 21 in Mexico City
  assert.equal(summary(records, "2026-12-19T06:00:00Z").remaining.days, 0);
  assert.equal(summary(records, "2026-12-19T06:00:00Z").remaining.phase, "ended");
  assert.equal(summary(records, "2026-11-19T18:00:00Z").remaining.phase, "not-started");
  assert.equal(summary(records, "2026-12-18T18:00:00Z").remaining.days, 0);
});

test("UTC instants group correctly at midnight and month/year boundaries", () => {
  assert.equal(selectors.dayKey("2027-01-01T05:30:00Z", "America/Mexico_City"), "2026-12-31");
  assert.equal(selectors.dayKey("2027-01-01T05:30:00Z", "America/New_York"), "2027-01-01");
  assert.equal(selectors.dayKey("2026-12-01T05:59:00Z", "America/Mexico_City"), "2026-11-30");
  const data = clone();
  data.occurrences[0].scheduledAt = "2027-01-01T05:30:00Z";
  data.publishJobs.filter((job) => job.occurrenceId === data.occurrences[0].id).forEach((job) => { job.status = "scheduled"; job.publishedAt = null; });
  assert.ok(selectors.calendar(data, { campaignId: id, asOf }).days["2026-12-31"]);
});

test("DST jumps and repeated wall hours retain distinct UTC occurrences", () => {
  for (const [zone, before, after] of [
    ["America/New_York", "2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z"],
    ["America/Los_Angeles", "2026-03-08T09:30:00Z", "2026-03-08T10:30:00Z"],
    ["Europe/Madrid", "2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z"],
  ]) {
    assert.equal(selectors.formatTime(before, zone), "01:30");
    assert.equal(selectors.formatTime(after, zone), "03:30");
    assert.equal(selectors.dayKey(before, zone), selectors.dayKey(after, zone));
  }
  const data = clone(); data.campaigns[0].timeZone = "America/New_York";
  data.occurrences = [{ id: "fall-a", contentId: data.contentItems[0].id, scheduledAt: "2026-11-01T05:30:00Z" }, { id: "fall-b", contentId: data.contentItems[0].id, scheduledAt: "2026-11-01T06:30:00Z" }];
  data.publishJobs = []; data.milestones = [];
  const day = selectors.calendar(data, { campaignId: id, asOf: "2026-11-01T00:00:00Z" }).days["2026-11-01"];
  assert.equal(day.length, 2); assert.deepEqual(day.map((event) => event.time), ["01:30", "01:30"]);
  assert.notEqual(day[0].at, day[1].at);
});

test("results are independent of browser/process timezone", () => {
  const script = `const s=require('./campaign-selectors'); const d=require('./demo-campaigns'); console.log(JSON.stringify({s:s.summarize(d,'${id}','${asOf}'),c:s.calendar(d,{asOf:'${asOf}'})}));`;
  const outputs = ["UTC", "Pacific/Kiritimati", "America/Los_Angeles", "Europe/Madrid"].map((TZ) => execFileSync(process.execPath, ["-e", script], { cwd: __dirname, env: { ...process.env, TZ }, encoding: "utf8" }));
  outputs.forEach((result) => assert.equal(result, outputs[0]));
});

test("all page consumers load the shared contract; unsupported readiness claims are removed", () => {
  for (const file of ["index.html", "campaigns/index.html", "campaigns/winter-campaign/index.html", "calendar/index.html"]) {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    for (const script of ["demo-campaigns.js", "campaign-selectors.js", "campaign-view.js"]) assert.ok(source.includes(script), `${file}: ${script}`);
    assert.ok(!/3 \/ 5|3 of 5|60%|IN PLANNING|4 days remaining/.test(source), file);
  }
  for (const file of ["demo-campaigns.js", "campaign-selectors.js", "campaign-view.js", "active-post.js"]) {
    assert.ok(!/localStorage|sessionStorage|indexedDB|fetch\(/.test(fs.readFileSync(path.join(__dirname, file), "utf8")), file);
  }
});
