# PR #119 candidate audit

Candidate branch: `codex/gm-auth-account-flow`  
Implementation and test candidate: `d1d0caf20e338ccbaf2562185c02ebfbee5a5c5b`  
PR: [#119](https://github.com/goodmorning-mx/marketing/pull/119), open against `dev`.  
Integrated `dev` base: `3774945579b4c88e8268963bea85525054d4a596` (merged PR #122).  
The untracked `handoff/` Factory patch is preserved.

## Candidate changes and evidence

- [x] Corrected first-save SQL mapping and verified five-field create/update/read/later-login coverage, including `primary_goal` longer than 240 characters and preservation of unrelated Brand fields.
- [x] Brand Brief recovery keeps fields locked in confirmation, unknown-outcome and stale-write states. Retries are GET-only; stale comparisons show both versions and require an explicit choice with the displayed server validator.
- [x] EN/ES rendering updates existing message/action/comparison labels in place. It preserves customer text, flow state, validators, displayed comparisons and Retry/choice node identity.
- [x] Focused recovery suite: 9 passed. Language changes are exercised during failed confirmation, unknown save outcome and stale conflict; tests cover usable controls, GET-only retry, no duplicate writes and draft preservation.
- [x] Implementation/test candidate Actions runs [45145836268](https://github.com/goodmorning-mx/marketing/actions/runs/45145836268) and [45145836280](https://github.com/goodmorning-mx/marketing/actions/runs/45145836280) passed. The later audit-only PR head `46a6287107fef1ddc9cd6555c611c67c6efcfa63` also passed fresh runs [45146465914](https://github.com/goodmorning-mx/marketing/actions/runs/45146465914) and [45146465868](https://github.com/goodmorning-mx/marketing/actions/runs/45146465868). They cover PostgreSQL account/migration and adapter preservation suites, focused Node recovery tests, syntax, clean backend/frontend image builds, API health and Nginx/frontend startup smoke.
- [x] Actual ChatGPT in-app browser checks used a local synthetic request harness for deterministic failed-confirmation, unknown-outcome and stale-conflict responses. Retry and explicit-choice controls remained usable; retries were GET-only; no duplicate write or draft loss occurred; stale resolution used the displayed validator and completed confirmation/reload.
- [x] Responsive browser checks at 320px and 390px, plus desktop, found no horizontal overflow and confirmed controls/content remained reachable.
- [x] The language-transition fault tests and layout checks did not write to DEV or customer storage. They are not deployed-API acceptance.

## Ordered release gates

### A. Preservation release, PR #122

- Merged into `dev` as `3774945579b4c88e8268963bea85525054d4a596` (PR head `e0df9559b9bd66a5ee16034e3294b3bcd52a3931`).
- `dev` CI run [45144220462](https://github.com/goodmorning-mx/marketing/actions/runs/45144220462) passed after merge. PR CI run [45143907643](https://github.com/goodmorning-mx/marketing/actions/runs/45143907643) passed 12 PostgreSQL/API tests, clean backend/frontend images and API/Nginx/frontend startup checks.
- DEV API `/health` returned `{"service":"GoodMorning Marketing Adapters API","status":"ok","environment":"dev"}`. However, unauthenticated `GET /api/brands` returned `[]` on repeated checks; the merged authenticated implementation is expected to return 401 without a verified identity. Therefore the running API did not demonstrate the merged revision, and authenticated DEV acceptance is not established.
- Automatic deployment of the exact merged API/frontend revisions, required runtime-key presence, backup/recovery readiness and customer-flow acceptance remain unverified. Available GitHub access is read-only for deployments and branch protection; the in-app GitHub browser is logged out, and no Coolify session/tool is available. This does not establish that infrastructure or configuration is absent.

### B. Factory registration and runtime bindings

- Preserved local patch pins gm-auth 0.1.5 at `138d66cb44a94781e0d38d8afd1be2dbf718c294`, uses existing private PostgreSQL, generates backend-only `AUTH_JWT_SECRET`, and retains DEV cookie/origin contracts.
- Factory snapshot `6c0d1b0bccce146b40db84aaae92ae8aa8cf75ee`: 18 module contract tests passed; Resources V3 validation/composition and `compile_installation` accepted the binding plan. Local changes and untracked files remain preserved.
- Registration/reconciliation has not been submitted or merged because the required #122 deployed-DEV acceptance has not passed. Do not expose secret values or provision another database.

### C. Account release, PR #119

- Candidate `d1d0caf20e338ccbaf2562185c02ebfbee5a5c5b` is refreshed on merged #122 base `3774945579b4c88e8268963bea85525054d4a596`.
- Account CI passed for the implementation/test candidate and the later audit-only candidate. No code changed after the implementation/test candidate.
- #119 is not merged. Merge and deployment must wait for the prerequisite #122 API revision and DEV acceptance, then Factory registration/reconciliation, followed by exact-SHA API and frontend deployment verification.

## Data and release impact

Migrations are additive and retain PostgreSQL records and relationships. No destructive migration, reset, production change, or live customer-data write was performed. Approved social platform artwork and GoodMarketing-owned branding were preserved. No #119 merge, deployment, or deployed customer acceptance is claimed.

## Minimum external action to resume the ordered release

The release owner with Coolify/DEV access must inspect the automated deployment for `3774945579b4c88e8268963bea85525054d4a596`, ensure the existing automatic deployment has applied that exact revision to API and frontend, and provide read access to API/frontend revision and runtime readiness, runtime-key presence by key name, and latest backup/recovery evidence. If deployment is not running that SHA, use the established automatic deployment recovery/forward-fix process while preserving PostgreSQL. Then perform the authorized synthetic DEV acceptance before Factory registration and #119 merge.
