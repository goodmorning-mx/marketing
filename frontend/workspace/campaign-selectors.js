/* Pure read-only projections. asOf is injectable; no browser storage, API or wall-time conversion. */
(() => {
  function instant(value) {
    if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : null;
  }
  function dayKey(value, timeZone) {
    const at = instant(value);
    if (at === null) return null;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
    const field = (type) => parts.find((part) => part.type === type).value;
    return `${field("year")}-${field("month")}-${field("day")}`;
  }
  function formatTime(at, timeZone, locale = "en-US") {
    return instant(at) === null ? "—" : new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
  }
  function formatDate(at, timeZone, locale = "en-US") {
    return instant(at) === null ? "—" : new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium" }).format(new Date(at));
  }
  function dateOnly(key, locale = "en-US") {
    return /^\d{4}-\d{2}-\d{2}$/.test(key || "")
      ? new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(new Date(`${key}T12:00:00Z`)) : "—";
  }
  function remaining(campaign, asOf) {
    const today = dayKey(asOf, campaign.timeZone);
    const dayNumber = (key) => Date.parse(`${key}T00:00:00Z`) / 86400000;
    return {
      days: Math.max(0, dayNumber(campaign.endDate) - dayNumber(today)),
      phase: today < campaign.startDate ? "not-started" : today > campaign.endDate ? "ended" : "running",
    };
  }
  const eligible = (delivery) => ["scheduled", "queued", "pending"].includes(delivery.status);

  function occurrence(records, row, content, asOf) {
    const now = instant(asOf);
    const deliveries = content.variants.map((variant) => {
      const jobs = records.publishJobs.filter((job) => job.occurrenceId === row.id && job.contentId === content.id && job.platform === variant.kind);
      // One logical delivery per occurrence/platform; retries are attempts, not new posts.
      const confirmations = jobs.filter((job) => job.status === "published" && instant(job.publishedAt) !== null && instant(job.publishedAt) <= now);
      const publishedAt = confirmations.map((job) => job.publishedAt).sort((a, b) => instant(a) - instant(b))[0] || null;
      const latest = [...jobs].sort((a, b) => (a.attempt || 0) - (b.attempt || 0) || a.id.localeCompare(b.id)).at(-1);
      return {
        platform: variant.kind, variant, publishedAt,
        status: publishedAt ? "published" : latest?.status === "published" ? "unconfirmed" : latest?.status || "scheduled",
      };
    });
    const confirmed = deliveries.filter((delivery) => delivery.publishedAt);
    const complete = deliveries.length > 0 && confirmed.length === deliveries.length;
    const cancelled = row.status === "cancelled";
    const pending = !cancelled && row.status !== "blocked" && !complete && deliveries.some(eligible);
    const scheduledAt = instant(row.scheduledAt) === null ? null : row.scheduledAt;
    const publishedAt = confirmed.map((delivery) => delivery.publishedAt).sort((a, b) => instant(b) - instant(a))[0] || null;
    const overdue = pending && scheduledAt && instant(scheduledAt) < now;
    const status = cancelled ? "cancelled" : complete ? "posted" : confirmed.length ? "partial" : !scheduledAt ? "unscheduled"
      : row.status === "blocked" || (deliveries.length && deliveries.every((delivery) => delivery.status === "blocked")) ? "blocked" : pending ? (overdue ? "overdue" : "scheduled") : "unconfirmed";
    return { ...row, content, campaignId: content.campaignId, scheduledAt, publishedAt, deliveries, complete, pending, overdue, status };
  }

  function postFor(summary, view, platform = null) {
    const candidates = summary.occurrences.flatMap((row) => {
      if (view === "next") {
        const delivery = platform ? row.deliveries.find((item) => item.platform === platform && eligible(item)) : null;
        if (!row.pending || !row.scheduledAt || instant(row.scheduledAt) < instant(summary.asOf) || (platform && !delivery)) return [];
        return [{ ...row, at: row.scheduledAt, variant: delivery?.variant || null }];
      }
      const delivery = platform ? row.deliveries.find((item) => item.platform === platform && item.publishedAt) : null;
      const at = platform ? delivery?.publishedAt : row.publishedAt;
      return at ? [{ ...row, at, variant: delivery?.variant || null }] : [];
    });
    candidates.sort((a, b) => (view === "next" ? 1 : -1) * (instant(a.at) - instant(b.at)) || a.id.localeCompare(b.id));
    return candidates[0] || null;
  }

  function summarize(records, campaignId, asOf = new Date().toISOString()) {
    if (instant(asOf) === null) throw new RangeError("asOf must be an explicit instant");
    const campaign = records.campaigns.find((item) => item.id === campaignId);
    if (!campaign) return null;
    const content = records.contentItems.filter((item) => item.campaignId === campaignId);
    const byId = new Map(content.map((item) => [item.id, item]));
    const rows = records.occurrences.filter((row) => byId.has(row.contentId));
    const occurrences = [...new Map(rows.map((row) => [row.id, row])).values()].map((row) => occurrence(records, row, byId.get(row.contentId), asOf));
    const pending = occurrences.filter((row) => row.pending && row.scheduledAt);
    const summary = {
      source: "demo", campaign, asOf, occurrences,
      planningProgress: null,
      contentCount: content.length,
      upcomingCount: pending.filter((row) => instant(row.scheduledAt) >= instant(asOf)).length,
      overdueCount: pending.filter((row) => instant(row.scheduledAt) < instant(asOf)).length,
      publishedContentCount: new Set(occurrences.filter((row) => row.publishedAt).map((row) => row.contentId)).size,
      confirmedDeliveryCount: occurrences.reduce((sum, row) => sum + row.deliveries.filter((delivery) => delivery.publishedAt).length, 0),
      partialCount: occurrences.filter((row) => row.status === "partial").length,
      remaining: remaining(campaign, asOf),
    };
    summary.nextPost = postFor(summary, "next");
    summary.lastPost = postFor(summary, "last");
    return summary;
  }

  function calendar(records, { campaignId = null, asOf = new Date().toISOString() } = {}) {
    const selected = campaignId === null ? null : records.campaigns.find((item) => item.id === campaignId);
    const timeZone = selected?.timeZone || records.displayTimeZone;
    // Unknown IDs fail closed; never fall back to unrelated campaigns.
    if (campaignId !== null && !selected) return { notFound: true, timeZone, campaign: null, events: [], days: {} };
    const campaigns = selected ? [selected] : records.campaigns;
    const events = campaigns.flatMap((campaign) => {
      const summary = summarize(records, campaign.id, asOf);
      const posts = summary.occurrences.flatMap((row) => {
        const at = row.complete ? row.publishedAt : row.scheduledAt;
        if (!at || row.status === "cancelled") return [];
        return [{ id: row.id, campaignId: campaign.id, campaignName: campaign.name, contentId: row.contentId, at,
          type: "content", status: row.status, title: row.content.title,
          platforms: row.deliveries.map((delivery) => ({ ...delivery.variant, status: delivery.status === "published" ? "posted" : row.status === "blocked" ? "blocked" : row.overdue && eligible(delivery) ? "overdue" : delivery.status })) }];
      });
      const milestones = records.milestones.filter((item) => item.campaignId === campaign.id && instant(item.at) !== null)
        .map((item) => ({ ...item, campaignName: campaign.name, milestone: item.kind === "milestone" }));
      return [...posts, ...milestones];
    }).sort((a, b) => instant(a.at) - instant(b.at) || a.id.localeCompare(b.id));
    const days = {};
    events.forEach((event) => {
      const key = dayKey(event.at, timeZone);
      (days[key] ||= []).push({ ...event, time: formatTime(event.at, timeZone) });
    });
    return { notFound: false, campaign: selected, timeZone, events, days };
  }
  const api = Object.freeze({ instant, dayKey, formatTime, formatDate, dateOnly, remaining, summarize, postFor, calendar });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.GoodMarketingCampaigns = api;
})();
