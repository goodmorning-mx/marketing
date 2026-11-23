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

## Sol intake ledger — 2026-11-23 03:46 America/Mexico_City

This ledger supersedes the earlier access recommendation. Use only the existing GitHub/Factory Coolify integration; never request personal Coolify access. No operator has been contacted.

| Gate | Refreshed evidence | State / next owner |
| --- | --- | --- |
| Marketing candidate | PR #119 remains open; remote/local head `8adc4933fa62a65aeb8156c746e6e960950f4bb2`, base `3774945579b4c88e8268963bea85525054d4a596`. Only audit changes follow implementation/test commit `d1d0caf20e338ccbaf2562185c02ebfbee5a5c5b`. | Four open findings assigned to Luna in `handoff/luna-open-findings.md`; Sol reviews return. |
| Exact-head CI | Re-read successful job records: [Account 45146976725](https://github.com/goodmorning-mx/marketing/actions/runs/45146976725), [Adapters 45146976640](https://github.com/goodmorning-mx/marketing/actions/runs/45146976640). | Carry forward; new candidate head must pass required CI. No rerun dispatched. |
| Preservation merge | PR #122 merged as `3774945579b4c88e8268963bea85525054d4a596`; [post-merge CI 45144220462](https://github.com/goodmorning-mx/marketing/actions/runs/45144220462) still successful. | Implementation/CI closed; deployed acceptance open. |
| Live public contract | Fresh TLS-verified curl: `/health` 200/ok; anonymous `/api/brands` 200 `[]`; OpenAPI lacks demo-request routes. Python urllib initially failed local CA verification; curl succeeded with normal verification. | Mismatch persists. Do not submit demo data or claim authenticated acceptance against this API. |
| Factory source | `dev` remains `6c0d1b0bccce146b40db84aaae92ae8aa8cf75ee`; Marketing manifest blob `d5c440fc8da63ed01aafd6d474aa20311df96e95` has separate API/frontend and private PG16 but no gm-auth registration. Open Factory PR listing contains no Marketing/auth PR. | Binding is not registered in source. Runtime binding unknown. |
| Existing reconciliation | Latest V3 [44168176676](https://github.com/goodmorning-mx/goodmorning-factory/actions/runs/44168176676), job `134339762300`, succeeded November 17; actual apply/backup output concerns ArcoEnergy. Latest 100 Factory runs contain no post-#122 V3 reconciliation. Native product deployments need not create Factory runs. | Does not prove Marketing revision, configuration or backups. |
| API deployment identity | Expected repo `goodmorning-mx/marketing`, branch `dev`, domain `https://api.dev.marketing.goodmorning.mx`, source `/backend`. | Serving SHA, latest successful deployment and later rollout/rollback unknown. |
| Frontend deployment identity | Expected same repo/branch, domain `https://dev.marketing.goodmorning.mx`, source `/frontend`. | Serving SHA, latest successful deployment and later rollout/rollback unknown. |
| Factory patch | Existing untracked patch preserved; `git apply --check` passes on clean Factory `6c0d1b0`. Previous 18 passing contract tests/composition evidence retained because patch/source unchanged. Registry still approves embedded gm-auth 0.1.5 at `138d66cb44a94781e0d38d8afd1be2dbf718c294`. | Apply through reviewed Factory PR once deployment identity/independent preservation prerequisites pass; may precede authenticated smoke if required. |
| Access | No workflow-dispatch tool exposed; `gh` absent. Connector permission lookup returns 403 (does not establish collaborator role). In-app GitHub workflow page visibly signed out, no Run workflow control. | Fresh Factory observation/repair cannot be dispatched with current interfaces. No credentials requested. |

### Single Factory evidence dependency

A Factory operator with existing authorized runner access can supply one sanitized Marketing-only report. This is a checklist, not an instruction to contact anyone without user authorization:

1. Run **Product development operations**, Factory branch `dev`, product `marketing`, operation `plan`, blank confirmation, established server/GitHub App `goodmorning-mx-coolify`, and confirmed DEV destination. Historical V3 logs show destination `g61slcctgnbvhhc8si0h9tf0`; confirm it is the established Marketing destination before dispatch. Report exact API/frontend resource matches and configuration. Plan is structural and GET-only.
2. For each matched application independently, use existing Factory runner credentials with `GET /api/v1/deployments/applications/{app_uuid}?skip=0&take=10` and relevant `GET /api/v1/deployments/{deployment_uuid}`. Report repository, branch, domain, app UUID, latest successful deployment time, Marketing source SHA if supplied, all subsequent deployment/rollback events, and whether that identifies the currently serving revision. Record SHA unknown if omitted; a Factory workflow SHA is not product evidence.
3. Report runtime key presence by name only, private database identity and latest verified backup/recovery target/status. Never include secret values. Preserve existing PostgreSQL. If evidence warrants repair, Sol's existing authorization covers the documented Marketing-only DEV repair through normal gates; observation alone must not dispatch Resources V3 apply/deploy.

After evidence arrives, Sol diagnoses the preservation mismatch, completes synthetic demo submission/staff queue and authenticated Adapters acceptance (with scoped historical caller access), applies the reviewed Factory binding once if needed, then reviews/merges corrected #119 after its checks and verifies both deployments plus live customer acceptance. No release gate is waived by this ledger.

### Verification scope and impact

Intake used GitHub connector records, refreshed Git refs, source inspection and TLS-verified HTTP reads. Browser use checked GitHub workflow access only; it did not exercise customer acceptance. Existing mock/fault/mobile evidence remains classified as simulated. No new test run was needed for this documentation-only intake. No application code, schema, configuration, secrets or deployed resources changed; no merge or dispatch occurred. Recovery remains the last independently verified deployment/backup once Factory supplies it. Documentation can be reverted independently.

## Luna implementation evidence — 2026-11-23

Implementation/test commit: `b94f64f2e572b2b8c270cc7c3fde3783d6bb6f0d` (parent candidate `8adc4933fa62a65aeb8156c746e6e960950f4bb2`). The remote `dev` tip advanced to `b58665e` for social-logo work; the PR branch stayed at the stated candidate before this change. No social marks were changed.

| Finding | Implementation and evidence | State |
| --- | --- | --- |
| Multi-workspace return | Login now offers a workspace choice after password verification. `/auth/workspaces` lists only gm-auth membership rows for the verified user and uses the separate GoodMarketing display name. Login accepts an optional organization selector which gm-auth verifies; an arbitrary/non-member selector fails. Regression covers one identity selecting two organizations after logout, their separate display names, viewer/owner role and distinct brief, plus rejected arbitrary selection. | Implemented and HTTP/API tested. Browser-integrated acceptance remains open below. |
| Primary Brand write contract | Shared validation rejects whitespace-only primary names and tone over 240 through both Brand Brief PUT and Adapters PATCH before mutation. PATCH now accepts omitted fields while preserving historical BrandIn OpenAPI and non-primary contracts. PostgreSQL test verifies invalid writes retain fields/revision ETag, partial PATCH preserves omitted fields, successful cross-route update invalidates the previous ETag, and existing concurrent write test remains passing. | Implemented and PostgreSQL tested. |
| Ambiguous gateways | Received HTTP 502/504 follows the locked unknown-outcome read-back state. Tests cover committed response with newer conflicting server data, uncommitted timeout, failed recovery read, GET-only retry, preserved draft and no duplicate PUT. Existing explicit conflict choices and definitive failure handling tests remain passing. | Implemented and tested. |
| Integrated acceptance | No browser-integrated customer acceptance was run. The candidate is not deployed, and the public DEV API is the previously recorded preservation-contract failure. The available isolated PG16 DB can support HTTP-client tests, but there is no configured candidate frontend/API origin pair with trusted TLS for the required in-app cross-origin cookie/ETag flow. No synthetic response harness was presented as integrated evidence, and no DEV resource was changed. | Open; requires a reviewable corrected candidate served at browser-accessible frontend and API origins backed by isolated PG16, then owner A/viewer A/owner B plus multi-workspace browser exercise. |

### Verification on implementation commit

- `node --test frontend/tests/brand-brief-flow.test.cjs`: 11 passed, 0 failed, 0 skipped.
- `node --check frontend/login.js`: passed.
- Backend full suite with only `TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/gm119_candidate_final` supplied to the suite: 35 passed, 0 failed, 0 skipped on PostgreSQL 16.11. SQLite-backed tests retained their fixture-local `DATABASE_URL` behavior.
- Initial full diagnostic run had three failures: two historical OpenAPI contract assertions and one later-login expectation after a successful PATCH. The PATCH runtime schema was separated from its historical OpenAPI contract and the persisted description expectation was corrected; the final full run above passed.
- `git diff --check`: passed.
- Existing integration service is disposable local PG16 under `/Users/Personal/.codex/tmp/gm119-validation-35bbeab/pgdata`; this run used newly created database `gm119_candidate_final`. No shared or deployed database was reset.

### Impact and recovery

No migration or persistent schema/configuration change. New runtime behavior is limited to authenticated workspace selection, primary Brand validation on PATCH, and gateway timeout reconciliation. The login page remains simple for one-workspace identities. If a workspace is not in the gm-auth membership list, login rejects it. If a gateway outcome cannot be read, the draft remains locked and the existing GET-only recovery action can be retried; a divergent server revision presents explicit conflict choices. Reverting commit `b94f64f` restores the prior code behavior without data migration. Existing audit-only intake and the untracked Factory patch were preserved.

The implementation is pushed to the existing PR branch for review and required CI. No CI result or deployed acceptance is claimed by this ledger entry; record the exact PR-head Actions result after it completes. Sol retains review, merge, Factory, DEV release and deployed acceptance ownership.

## Updated candidate acceptance — implementation SHA `6e3429c9568b5e4695081e4f5af3dd6baa463fdf`

This entry supersedes the earlier statement that browser acceptance was not run. The code commit followed the initial implementation commit `b94f64f2e572b2b8c270cc7c3fde3783d6bb6f0d` with a local-only API-base override and optional host-only cookie configuration, needed to serve the actual candidate from two local browser origins without weakening the default DEV cookie configuration. The PR branch was pushed through `6e3429c`; no merge, deploy, or Factory operation occurred.

### Browser-integrated acceptance

ChatGPT in-app browser used the actual candidate frontend and API on separate origins: `http://127.0.0.1:8081` and `http://127.0.0.1:8000`. Backend storage was the newly created isolated PostgreSQL 16.11 database `gm119_browser_acceptance`. A local static server injected only `GM_API_URL` into the candidate frontend; the API was not intercepted or mocked. Browser login and successful conditional save/reload exercised the real credential flow, real API responses, browser-readable CORS-exposed ETag, confirmation GET, page reload, and later sign-in.

- Owner A logged into Alpha, saved all five distinctive fields (`Alpha Fieldwork Studio`; `Distinctive owner A description for browser acceptance`; `Independent neighborhood grocers`; `Warm, practical, bilingual`; `Grow repeat orders in Q1`), and saw the same values after the successful save reload and another logout/login.
- Viewer A logged into Alpha and saw those exact five fields with all five editing controls disabled and the view-only notice. The PostgreSQL/HTTP regression separately confirms viewer write refusal (403).
- Owner B logged into Beta, saved a separate distinctive five-field brief (`Beta Orchard Cooperative`; `Owner B browser-only strategy text`; `Regional fruit growers`; `Direct, optimistic, grounded`; `Increase seasonal subscriptions`).
- Owner A has verified memberships in Alpha as owner and Beta as viewer. After logout, the login page listed both membership-verified workspace names. Selecting Beta returned Owner A to Beta with viewer controls and Owner B’s Beta brief; a later login selecting Alpha returned Owner A with owner controls and Owner A’s original Alpha brief. The backend regression rejects a non-member organization selector with 401.
- API access logs show real `/auth/workspaces`, `/auth/login`, `/auth/me`, `/workspace`, `/workspace/brand-brief` and save traffic. No live DEV API, synthetic response interception, or shared database was used.

### Exact-SHA regression

Against implementation source `6e3429c9568b5e4695081e4f5af3dd6baa463fdf`:

- Backend full suite on a new PG16 database `gm119_candidate_sha`: **35 passed, 0 failed, 0 skipped** (61.15 seconds; 77 deprecation warnings).
- Frontend recovery suite: **11 passed, 0 failed, 0 skipped**.
- `node --check frontend/login.js`, `node --check frontend/workspace/brand-brief-flow.js`, and `git diff --check`: passed.
- No tests were run against a shared or deployed database.

### CI and remaining handoff

The push to PR #119 head `6e3429c9568b5e4695081e4f5af3dd6baa463fdf` completed. GitHub PR check diagnostics and the connected commit-workflow query both returned no checks or workflow runs on two reads after the push; PR metadata confirmed the exact head SHA. No duplicate workflow was dispatched. Required CI remains unreported and should be checked again before merge. CI is not a local code failure; keep the branch unchanged unless diagnostics identify a code issue.

All four implementation findings are addressed and locally proven. Remaining release gates belong to Sol: verify exact-head CI when GitHub reports it; review this candidate; complete Factory registration/release gates and DEV deployment checks through the authorized integration; then perform the deployment acceptance as prescribed. The browser run was against actual candidate services on isolated local origins, not the deployed DEV domains.

The host-only cookie mode is opt-in with an empty `AUTH_COOKIE_DOMAIN`; default `dev.marketing.goodmorning.mx` behavior is unchanged. The frontend API-base override is opt-in through `window.GM_API_URL`; normal deployed fallback remains `https://api.${location.host}`. No migration or persistent schema changes were added. Local API/frontend services were stopped after the run; the isolated PG16 data directory was retained without reset for recovery/audit.

## Sol return review — 2026-11-23

- Reviewed Luna implementation `b94f64f2e572b2b8c270cc7c3fde3783d6bb6f0d`, local acceptance support `6e3429c9568b5e4695081e4f5af3dd6baa463fdf` and ledger head `18ac7763955ba47fbd44ad0e1c4cb124e63d94f5`. The four original findings are addressed. Carry forward Luna's actual-candidate browser acceptance and unchanged fault/mobile evidence with their stated scopes; deployed acceptance remains open.
- Refreshed `dev` to `9c9d75b494542c1efc9c27e0faf19a2c532961e1` (dashboard social sizing, CI [45151422341](https://github.com/goodmorning-mx/marketing/actions/runs/45151422341) successful). PR #119 had a real merge conflict, explaining the absent pull-request workflow trigger. Integrated current `dev` in `025b7a727f12883918ddd305da41f52548ce3e56`; resolved only the Brand Brief head line, retaining the account scripts and current stylesheet version. Social assets remain identical to current `dev`.
- Review caught one historical contract regression: optional `BrandPatchIn.name` had lost the previous minimum length, allowing an empty non-primary name. Restored `min_length=1` and added route-level regression evidence that rejection leaves the previous name intact. Omitted fields stay optional.
- Validation on integrated source with that fix: **35 backend tests passed, zero skips**, fresh isolated PG16 database `gm119_sol_review_1040`, 77 deprecation warnings; **11 frontend recovery tests passed**, zero skips; workspace/login syntax and diff checks passed. Only TEST_DATABASE_URL was supplied to the full suite. No shared data or deployed resources changed. This integration/fix requires fresh required CI; no duplicate dispatch requested.
- PR review and thread queries returned no submitted reviews or unresolved threads. Sol's source review is recorded here; no GitHub approval is fabricated.
- Fresh Factory latest-run read still shows V3 run `44168176676` as newest, with no new Marketing evidence. Fresh TLS-verified DEV `/api/brands` still returns anonymous 200 `[]`. The previously recorded single Factory evidence dependency remains open for both API and frontend. Do not merge #119 until ordered release prerequisites pass.
- No schema/migration/secret/runtime configuration changes. Recovery for Sol's integration is to revert the integration/fix through a reviewed PR if needed; database rollback is unnecessary. Existing untracked handoff files are preserved. The locally restarted isolated PG16 server is stopped after validation, and its files retained.

### Sol corrected-head CI result

Reviewed implementation/test candidate `31df8cae39e2aec8c6aea34395eb341b28b439aa` passed both automatically triggered required workflows:

- [Account flow checks 45154149093](https://github.com/goodmorning-mx/marketing/actions/runs/45154149093), job `137622712892`: success, PostgreSQL suite/recovery tests/syntax/clean backend and frontend builds/account-page startup smoke.
- [Marketing Adapters preservation 45154149255](https://github.com/goodmorning-mx/marketing/actions/runs/45154149255), job `137622712221`: success, PostgreSQL preservation suite/syntax/clean builds/API and Nginx startup smoke.

GitHub now reports the PR mergeable. Resolving the real conflict restored automatic PR CI; no manual or duplicate workflow dispatch was needed. The final audit-only commit records these results and does not reopen implementation review. Release remains held at the previously specified Factory deployment-history/runtime/backup evidence prerequisite; all independent candidate implementation, integration, review and CI work is complete. No new Luna assignment is required. Operator contact still requires the user's explicit authorization; this entry does not contact an operator or request personal Coolify access.
