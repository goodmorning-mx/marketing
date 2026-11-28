(function (root) {
  function createBrandBriefFlow({ fields, request, readDraft, applyBrief, setEditable, onStatus, onLoaded, beforeReload, onConfirmed, onConflict }) {
    let phase = "initial";
    let generation = 0;
    let etag = null;
    let pending = null;
    let conflict = null;

    const transition = (next) => {
      phase = next;
      generation += 1;
      setEditable(next === "ready");
      return generation;
    };
    const isCurrent = (token, expectedPhase) => generation === token && phase === expectedPhase;
    const currentBrief = async () => {
      const response = await request("/workspace/brand-brief");
      if (!response.ok) throw new Error("Could not read the brand brief.");
      const data = await response.json();
      return { brief: data.brief, tag: response.headers.get("ETag") };
    };
    const sameFields = (serverBrief, draft) => Boolean(serverBrief && fields.every((field) => serverBrief[field] === draft[field]));

    async function load() {
      if (phase !== "initial" && phase !== "load-error") return false;
      const token = transition("loading");
      try {
        const current = await currentBrief();
        if (!isCurrent(token, "loading")) return false;
        etag = current.tag;
        pending = null;
        conflict = null;
        applyBrief(current.brief);
        transition("ready");
        onLoaded(current.brief, current.tag);
        return true;
      } catch {
        if (!isCurrent(token, "loading")) return false;
        transition("load-error");
        onStatus("load-error");
        return false;
      }
    }

    async function confirmCommitted(token) {
      transition("confirming");
      const confirmToken = generation;
      try {
        const current = await currentBrief();
        if (!isCurrent(confirmToken, "confirming") || token !== confirmToken - 1) return false;
        etag = current.tag;
        applyBrief(current.brief);
        pending = null;
        conflict = null;
        transition("reloading");
        let markerSaved = false;
        try { markerSaved = beforeReload() === true; } catch {}
        onStatus(markerSaved ? "saved" : "saved-no-marker");
        onConfirmed(current.brief, current.tag);
        return true;
      } catch {
        if (!isCurrent(confirmToken, "confirming") || token !== confirmToken - 1) return false;
        transition("confirm-pending");
        onStatus("confirm-pending");
        return false;
      }
    }

    async function readAfterUncertainWrite(cause) {
      if (!pending || !["unknown-pending", "stale-pending"].includes(phase)) return false;
      const token = transition(cause === "unknown" ? "checking-unknown" : "checking-stale");
      try {
        const current = await currentBrief();
        if (!isCurrent(token, cause === "unknown" ? "checking-unknown" : "checking-stale")) return false;
        if (sameFields(current.brief, pending.draft)) {
          etag = current.tag;
          applyBrief(current.brief);
          pending = null;
          transition("ready");
          onStatus(cause === "unknown" ? "outcome-current" : "already-current");
          return true;
        }
        const context = {
          id: token,
          cause,
          serverBrief: current.brief,
          serverTag: current.tag,
          originalTag: pending.originalTag,
          draft: { ...pending.draft },
          allowRetryOriginal: current.tag === pending.originalTag,
        };
        conflict = context;
        transition("conflict");
        context.id = generation;
        conflict = context;
        onConflict(context);
        return true;
      } catch {
        if (!isCurrent(token, cause === "unknown" ? "checking-unknown" : "checking-stale")) return false;
        transition(cause === "unknown" ? "unknown-pending" : "stale-pending");
        onStatus(cause === "unknown" ? "unknown-pending" : "stale-pending");
        return false;
      }
    }

    async function save(draft = readDraft(), validator = etag) {
      if (phase !== "ready" || !validator) return false;
      pending = { draft: { ...draft }, originalTag: validator, outcome: null };
      conflict = null;
      onStatus(null);
      const token = transition("saving");
      let response;
      try {
        response = await request("/workspace/brand-brief", {
          method: "PUT",
          headers: { "If-Match": validator },
          body: JSON.stringify(pending.draft),
        });
      } catch {
        if (!isCurrent(token, "saving")) return false;
        pending.outcome = "unknown";
        transition("unknown-pending");
        return readAfterUncertainWrite("unknown");
      }
      if (!isCurrent(token, "saving")) return false;
      if (!response.ok) {
        if (response.status === 502 || response.status === 504) {
          pending.outcome = "unknown";
          transition("unknown-pending");
          return readAfterUncertainWrite("unknown");
        }
        if (response.status === 412) {
          pending.outcome = "stale";
          transition("stale-pending");
          return readAfterUncertainWrite("stale");
        }
        pending = null;
        transition("ready");
        onStatus("save-error");
        return false;
      }
      pending.outcome = "committed";
      return confirmCommitted(token);
    }

    async function retryRecovery() {
      if (phase === "confirm-pending" && pending?.outcome === "committed") {
        return confirmCommitted(generation);
      }
      if (phase === "unknown-pending" && pending?.outcome === "unknown") {
        return readAfterUncertainWrite("unknown");
      }
      if (phase === "stale-pending" && pending?.outcome === "stale") {
        return readAfterUncertainWrite("stale");
      }
      return false;
    }

    async function chooseConflict(id, choice) {
      if (phase !== "conflict" || !conflict || conflict.id !== id) return false;
      const selected = conflict;
      if (choice === "retry-original" && !selected.allowRetryOriginal) return false;
      if (!["load-server", "keep-draft", "replace-draft", "retry-original"].includes(choice)) return false;

      const chosenTag = choice === "retry-original" ? selected.originalTag : selected.serverTag;
      const chosenDraft = { ...selected.draft };
      conflict = null;
      pending = null;
      etag = chosenTag;
      if (choice === "load-server") {
        applyBrief(selected.serverBrief);
        transition("ready");
        onStatus(null);
        return true;
      }
      applyBrief(chosenDraft);
      transition("ready");
      if (choice === "keep-draft") {
        onStatus("reconcile-ready");
        return true;
      }
      if (choice === "replace-draft" || choice === "retry-original") return save(chosenDraft, chosenTag);
      return false;
    }

    function getState() {
      return {
        phase,
        generation,
        etag,
        pending: pending ? { ...pending, draft: { ...pending.draft } } : null,
        conflict: conflict ? { ...conflict, draft: { ...conflict.draft } } : null,
      };
    }

    return { load, save, retryRecovery, chooseConflict, getState };
  }

  const api = { createBrandBriefFlow };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GMBrandBriefFlow = api;
})(typeof window !== "undefined" ? window : globalThis);
