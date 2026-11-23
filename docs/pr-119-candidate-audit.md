# PR #119 candidate audit

Candidate branch: `codex/gm-auth-account-flow`
Current PR head: `555d14c3d6d52bc0c54758b2024b42e26a597cd3`
Account/Brand Brief implementation: `c9bb783d3c02819de96a77a8a4873eb6c68cc109`; subsequent changes configure the DEV origin in three PostgreSQL test cases only.
Integrated latest `dev`: `e5ed7598e9f86e4dc9aefdf27301b6937129680f` (video-only; no account or Brand Brief changes).
PR: [#119](https://github.com/goodmorning-mx/marketing/pull/119), open and not merged or deployed.
The untracked `handoff/` Factory patch remains preserved.

## Candidate changes and validation

- [x] Fixed the original first-save SQL mapping. Exact five-field create/update/independent-read/later-login coverage preserves a `primary_goal` longer than 240 characters and unrelated Brand fields.
- [x] Brand Brief recovery uses one state machine. Fields remain locked during confirmation, unknown-outcome, and stale-write recovery; retries are GET-only; stale comparisons require explicit choices and use the displayed server validator.
- [x] Fixed language rendering: EN/ES updates now change existing message, action, and comparison-label nodes. They do not replace feedback content, remove retry/choice buttons, replace comparison text, alter customer values, or mutate the flow's validators/state. Added a cache-busted script URL.
- [x] Focused Node suite: **9 passed, 0 failed**. Includes EN/ES changes during failed confirmation, lost-write recovery, and stale comparison; checks action-node identity, draft preservation, GET-only retries, one write until an explicit choice, and conditional conflict resolution.
- [x] Full PostgreSQL 16 synthetic backend suite: **28 passed** on the current PR head in GitHub Actions run [45142525706](https://github.com/goodmorning-mx/marketing/actions/runs/45142525706). This also caught and corrected a test-only mismatch between the DEV request Origin and the test settings allowlist.
- [x] Actual ChatGPT in-app browser, local candidate page and synthetic request harness: failed confirmation GET retained distinct customer values and disabled fields; EN switch preserved the Retry control; retry made GET only, completed a full page reload, and loaded the saved five values. Unknown PUT response plus failed recovery GET retained the draft; ES switch preserved Retry; retry made GET only and showed the comparison without a second PUT. A stale 412 showed both server and draft fields; EN switch retained comparison content and all three explicit choices; keep-draft followed by save used the displayed `etag-server-2` validator and completed a confirmation/reload.
- [x] Responsive in-app browser checks at **320px** and **390px**: document/body scroll width matched each viewport (no horizontal page overflow); controls and brief content remained reachable. Default desktop width also had no horizontal overflow.
- [x] Current GitHub Actions run also passed Brand Brief recovery tests, JavaScript syntax, backend syntax, clean backend/frontend image builds and frontend startup smoke. Previous local checks include `pip check` and a high-confidence secret-pattern scan; the added renderer contains no credentials or runtime secrets.

The new browser language-transition runs used a local synthetic request layer to deterministically induce failure and conflict responses; they did not write to DEV or customer storage. Prior DB-backed browser acceptance against an isolated PostgreSQL fixture remains applicable to unchanged backend behavior.

## Ordered release gates

### A. Preservation release, PR #122

- Refreshed PR head: `ba12b275367912f79f441120a47bbab3b04514b9`, based on current `dev` `e5ed7598e9f86e4dc9aefdf27301b6937129680f`. It adds the existing gm-auth token/permission checks to historical adapter operations and ignores caller-supplied identity/tenant headers. Latest Actions run [45143367617](https://github.com/goodmorning-mx/marketing/actions/runs/45143367617) is for superseded head `dc7873b36dfde685762ebfc3637f0a6957df6533` and failed only during PostgreSQL fixture cleanup after 11 tests passed; the cleanup defect is fixed at `ba12b27` and its new run is pending.
- Earlier run [45142663331](https://github.com/goodmorning-mx/marketing/actions/runs/45142663331) passed PostgreSQL migration/preservation tests, clean images and API/Nginx startup smoke at superseded pre-auth head `51bdfce67b68354fe27587f80f459461891785eb`. It does not validate the current authenticated candidate.
- Do not merge or deploy until CI passes for `ba12b27` and the authenticated integration is reviewed. Deployment and DEV acceptance remain pending.

### B. Factory registration and runtime bindings

- Preserved patch pins gm-auth 0.1.5 SHA `138d66cb44a94781e0d38d8afd1be2dbf718c294`; manifest binds generated `AUTH_JWT_SECRET` and DEV-only `AUTH_COOKIE_DOMAIN` without exposing values.
- Refreshed Factory `dev` remains `6c0d1b0bccce146b40db84aaae92ae8aa8cf75ee`. At that snapshot, **18 module contract tests passed** and the Resources V3 validator accepted the manifest/bindings. Existing local manifest/test edits are preserved.
- No reviewed registration PR is present, and connected Factory GitHub access is read-only. The Factory maintainer must open/review the registration and reconcile runtime bindings after #122's DEV release.

### C. Corrected account release, PR #119

- Current candidate is `555d14c3d6d52bc0c54758b2024b42e26a597cd3`; PR remains open and unmerged. Its latest executed Actions run [45142525706](https://github.com/goodmorning-mx/marketing/actions/runs/45142525706) passed all PostgreSQL 16 account/migration tests (28), nine focused recovery tests, both syntax checks, clean backend/frontend image builds and frontend startup smoke.
- The earlier payment annotation is stale: current CI executes successfully. No current failed run or billing annotation blocks the candidate.
- No authorized Coolify control/read tool or session is exposed in this task, so API/frontend deployed revisions, required runtime-key presence, deployment status, backup/recovery evidence and runtime readiness remain unverified. DEV health previously returned `ok` but did not identify an application revision.
- The legacy integration callers and their scoped access remain to be checked against the authenticated PR #122 candidate and Factory registration. A pre-account API is not a safe rollback after account data exists.

## Data and release impact

Migration 006 remains additive and preserves historical rows and relationships; no destructive migration, reset, production change, or customer-data write was performed. The language-rendering fix adds one small frontend module and changes the Brand Brief script cache key; it changes no runtime configuration or migration. No DEV merge, deployment, or live customer acceptance is claimed.
