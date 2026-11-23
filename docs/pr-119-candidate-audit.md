# PR #119 candidate audit

Candidate branch: `codex/gm-auth-account-flow`
Current candidate SHA: `c9bb783d3c02819de96a77a8a4873eb6c68cc109`
Integrated latest `dev`: `e5ed7598e9f86e4dc9aefdf27301b6937129680f` (video-only; no account or Brand Brief changes).
PR: [#119](https://github.com/goodmorning-mx/marketing/pull/119), open and mergeable as of the latest refresh; not merged or deployed.
The untracked `handoff/` Factory patch remains preserved.

## Candidate changes and validation

- [x] Fixed the original first-save SQL mapping. Exact five-field create/update/independent-read/later-login coverage preserves a `primary_goal` longer than 240 characters and unrelated Brand fields.
- [x] Brand Brief recovery uses one state machine. Fields remain locked during confirmation, unknown-outcome, and stale-write recovery; retries are GET-only; stale comparisons require explicit choices and use the displayed server validator.
- [x] Fixed language rendering: EN/ES updates now change existing message, action, and comparison-label nodes. They do not replace feedback content, remove retry/choice buttons, replace comparison text, alter customer values, or mutate the flow's validators/state. Added a cache-busted script URL.
- [x] Focused Node suite: **9 passed, 0 failed**. Includes EN/ES changes during failed confirmation, lost-write recovery, and stale comparison; checks action-node identity, draft preservation, GET-only retries, one write until an explicit choice, and conditional conflict resolution.
- [x] Full PostgreSQL 16.11 synthetic backend suite: **28 passed** on isolated `gm119_synthetic`, previously run on `b702bec`. The backend, SQL mapping, migrations and tests have not changed since that run; current `dev` integration and this fix changed frontend landing/Brand Brief files only.
- [x] Actual ChatGPT in-app browser, local candidate page and synthetic request harness: failed confirmation GET retained distinct customer values and disabled fields; EN switch preserved the Retry control; retry made GET only, completed a full page reload, and loaded the saved five values. Unknown PUT response plus failed recovery GET retained the draft; ES switch preserved Retry; retry made GET only and showed the comparison without a second PUT. A stale 412 showed both server and draft fields; EN switch retained comparison content and all three explicit choices; keep-draft followed by save used the displayed `etag-server-2` validator and completed a confirmation/reload.
- [x] Responsive in-app browser checks at **320px** and **390px**: document/body scroll width matched each viewport (no horizontal page overflow); controls and brief content remained reachable. Default desktop width also had no horizontal overflow.
- [x] JavaScript syntax checks and `git diff --check` passed. Previous backend checks include `pip check`, Python compileall and a high-confidence secret-pattern scan; the added renderer contains no credentials or runtime secrets.

The new browser language-transition runs used a local synthetic request layer to deterministically induce failure and conflict responses; they did not write to DEV or customer storage. Prior DB-backed browser acceptance against an isolated PostgreSQL fixture remains applicable to unchanged backend behavior.

## Ordered release gates

### A. Preservation release, PR #122

- Current PR state is **open, mergeable, no submitted reviews**. Candidate head `e4c09ce8d8ae11e684f0ff363be9eda79cb4e09c` is based on older `dev` `4549a7dd9fa7297b0db66c47ba5eea0a2634654b`; current `dev` is `e5ed7598e9f86e4dc9aefdf27301b6937129680f`.
- Actions run [45020997214](https://github.com/goodmorning-mx/marketing/actions/runs/45020997214) failed before exposing any steps. Connected diagnostics returned no checks, statuses, annotations, or log; **the exact cause is unknown**. Do not treat it as an executed test failure or claim a confirmed billing restriction.
- The earlier local candidate suite reported 10 passed, including PostgreSQL tests. Neither clean application image build nor Nginx frontend smoke has executed. No accessible authorized image builder is available through current tools or the local host.
- Refresh #122 onto current `dev`, obtain review and executed CI/image evidence, then carry out the required automatic DEV deployment and acceptance before proceeding.

### B. Factory registration and runtime bindings

- Preserved patch pins gm-auth 0.1.5 SHA `138d66cb44a94781e0d38d8afd1be2dbf718c294`; manifest binds generated `AUTH_JWT_SECRET` and DEV-only `AUTH_COOKIE_DOMAIN` without exposing values.
- Refreshed Factory `dev` remains `6c0d1b0bccce146b40db84aaae92ae8aa8cf75ee`. At that snapshot, **18 module contract tests passed** and the Resources V3 validator accepted the manifest/bindings. Existing local manifest/test edits are preserved.
- No reviewed registration PR is present, and connected Factory GitHub access is read-only. The Factory maintainer must open/review the registration and reconcile runtime bindings after #122's DEV release.

### C. Corrected account release, PR #119

- Current candidate: `c9bb783d3c02819de96a77a8a4873eb6c68cc109`; PR remains open and unmerged.
- Actions run [45138914112](https://github.com/goodmorning-mx/marketing/actions/runs/45138914112) failed with zero exposed steps; diagnostics have no checks, statuses, annotations, or log. **Cause is unconfirmed.** This does not establish that tests ran or failed.
- Latest read-only DEV health returns service `GoodMorning Marketing Adapters API`, status `ok`, environment `dev`; it does not identify an application revision. No Coolify access is available for API/frontend application identities, serving SHAs, runtime-key presence, or deployment status.
- No evidence is available for the latest successful backup, tested recovery artifact or maintainer-owned containment/forward-fix, or the legacy integration callers and their scoped access. These remain required before release; a pre-account API is not a safe rollback after account data exists.

## Data and release impact

Migration 006 remains additive and preserves historical rows and relationships; no destructive migration, reset, production change, or customer-data write was performed. The language-rendering fix adds one small frontend module and changes the Brand Brief script cache key; it changes no backend configuration or migration. No DEV merge, deployment, or live customer acceptance is claimed.
