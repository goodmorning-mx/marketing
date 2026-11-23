# PR #119 candidate audit

Candidate branch: `codex/gm-auth-account-flow`
Reviewed account baseline: `35bbeab28704b903a9d6bd085020e895e486e0e4`
Latest fetched `dev` integrated: `4d7bb8abca9d9600f5902a56e37bcdea116b0ba7`
Prior reviewed candidate: `bdf91a87e6672d86b2ff80d0f995bc569ce55720`
Status: corrections committed on the PR branch; push/review pending. Not merged, deployed, registered, or live accepted.

## Completed checks

- [x] Preserved the untracked `handoff/` Factory registration patch and kept its gm-auth v0.1.5 SHA unchanged.
- [x] Account invite, activation, refresh-session rotation, and logout tests, including cross-organization identity join, wrong-password rejection, stale owner permission snapshots, duplicate-company retry identity, and activation retry after a partial failure.
- [x] Brand Brief contract, migration, ETag/If-Match rules, viewer/organization access checks, omitted-field preservation, and primary Brand adapter conflicts.
- [x] Local Python 3.12 suite: `python -m pytest -q tests` from `backend/` — 22 passed, 6 PostgreSQL-only skipped.
- [x] Full PostgreSQL 16.11 synthetic suite: `TEST_DATABASE_URL='postgresql+psycopg://postgres@127.0.0.1:55449/gm119_synthetic' CORS_ORIGINS='https://dev.marketing.goodmorning.mx' PYTHONPATH=. python -m pytest -q tests` from `backend/` — 28 passed, including migration replay, legacy schema/data/FK/default preservation, concurrent invitation redemption, two empty-brief writers, two existing-brief writers sharing one ETag (one 200, one 412), stale browser preconditions after an Adapters edit, and exact five-field create/update/reread/later-login checks with goals longer than 240 characters.
- [x] Corrected SQL first-save mapping; PostgreSQL regression compares all five customer fields in PUT, independent GET, update, and later authenticated login and verifies unrelated Brand columns stay intact.
- [x] In-app browser on a local candidate copy and fresh synthetic PostgreSQL database: owner login, empty brief, distinct five-field save with a >240-character goal, then an injected lost PUT response after commit. The page reread showed the committed values and explicitly reported that the client could not confirm who saved them.
- [x] Adapter compatibility workflow against current live DEV: 14 historical operations and health response match the approved baseline; candidate has 27 operations including account/demo routes.
- [x] `git diff --check`, `node --check frontend/auth.js`, `node --check frontend/workspace/workspace.js`, Python `compileall`, and `pip check` all passed. High-confidence token/private-key patterns were absent in changed runtime and migration files.

## Holds and unavailable evidence

- [ ] In-app browser did not complete normal successful-save/full-reload, failed confirmation GET/retry, failed bootstrap after navigation, viewer controls, or a stale-tab reconciliation. A stale-tab attempt loaded the current validator and therefore did not conflict; subsequent tab creation timed out in the browser control. The lost-response branch was exercised successfully. API viewer denials and concurrent conflict behavior are covered by the passing suite. Browser refresh is API-tested, not forced through an expired UI cookie.
- [ ] Clean frontend/backend application images and Nginx startup smoke: Docker and Nginx are not installed; no authorized builder/preview target was accessible.
- [ ] Corrected #119 head GitHub CI and Coolify deployment identity/status: #122 is still open and currently reports `mergeable: false`; its recorded Actions run was blocked before job steps by the billing/spending restriction. Do not merge #119 until #122 is reviewed, made mergeable, merged, deployed, and DEV-accepted. No deployment was triggered.
- [ ] Factory registration and runtime binding: no reviewed registration PR was found. The Factory handoff patch is preserved in `handoff/`; Factory maintainer must open/review/merge its registration after #122 is released and serving identity is verified.
- [ ] Coolify maintainer evidence: read-only API application UUID, repository/branch/serving SHA, frontend serving SHA, runtime key presence by name, latest backup status/time, and safe recovery identity are not available through current tools. Do not reconcile/deploy to discover them.
- [ ] Integration callers and scoped workspace access: integration maintainer must identify legacy callers and issue scoped access before release.
- [ ] Hosted execution availability: billing owner must resolve the repository spending restriction before GitHub Actions can run; do not repeatedly retry the unchanged restriction.
- [ ] Rollback of a pre-account API after account/brief data exists is unsafe. Maintainer owns containment/forward-fix gate while retaining PostgreSQL and additive records; no rollback artifact has been run against synthetic two-organization data.

## Release impact

Migration 006 is additive: historical/demo rows remain non-primary, the SQL defaults preserve old Brand inserts, and existing IDs, relations, ownership, and unrelated fields stay intact. API-first supports the previous frontend. Frontend-first remains gated until the compatible API serves. Retain the database and additive account/brief records on recovery. See [brand brief contract](brand-brief-contract.md) and [account workflow](accounts.md).
