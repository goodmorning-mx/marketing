# PR #119 candidate audit

Candidate branch: `codex/gm-auth-account-flow`
Reviewed account baseline: `35bbeab28704b903a9d6bd085020e895e486e0e4`
Remote `dev` baseline: `1b9d1f13bd5b1c10518305bc1ace8a6dbeeb4515`
Status: implemented locally; not merged, deployed, registered, or live accepted.

## Completed checks

- [x] Preserved the untracked `handoff/` Factory registration patch and kept its gm-auth v0.1.5 SHA unchanged.
- [x] Account invite, activation, refresh-session rotation, and logout tests, including cross-organization identity join, wrong-password rejection, stale owner permission snapshots, duplicate-company retry identity, and activation retry after a partial failure.
- [x] Brand Brief contract, migration, ETag/If-Match rules, viewer/organization access checks, omitted-field preservation, and primary Brand adapter conflicts.
- [x] Local Python 3.12 suite: `python -m pytest -q` — 22 passed, 5 PostgreSQL-only skipped.
- [x] Full PostgreSQL 16.11 synthetic suite: `TEST_DATABASE_URL='postgresql+psycopg://postgres@127.0.0.1:55449/gm119_synthetic' CORS_ORIGINS='https://dev.marketing.goodmorning.mx' PYTHONPATH=. python -m pytest -q tests` — 27 passed, including migrations/replay, legacy schema/data/FK/default preservation, concurrent invitation redemption, two simultaneous empty-brief writers, and stale browser preconditions after an Adapters edit.
- [x] Real ChatGPT in-app browser against a local candidate frontend and synthetic PostgreSQL: activation, login, account/workspace identity, empty brief, save, automatic server confirmation, full reload, later login, and retained server data. Cross-origin credentialed requests succeeded and exposed the ETag needed for the conditional save.
- [x] Browser language switch changed labels while preserving all five customer-authored values. Responsive document widths measured 320, 390, and default desktop with no horizontal overflow.
- [x] `git diff --check`, `node --check frontend/auth.js`, `node --check frontend/workspace/workspace.js`, Python `compileall`, and `pip check` all passed. High-confidence token/private-key patterns were absent in changed runtime and migration files.
- [x] Adapter contract workflow: historical and candidate OpenAPI contracts matched; live DEV contract and health matched the historical baseline (read-only).

## Holds and unavailable evidence

- [ ] In-app browser fault injection for lost PUT response, failed confirmation GET, bootstrap failure after navigation, viewer controls, stale tabs, and failed PUT was not run. API role/concurrency paths have automated coverage; these distinct browser outcomes are not claimed as browser-tested. Browser refresh was verified at the API test level, not by forcing an expired access cookie through the UI.
- [ ] Clean frontend/backend application images and Nginx startup smoke: Docker and Nginx are not installed; no authorized builder/preview target was accessible.
- [ ] GitHub CI for the candidate and Coolify deployment identity/status: branch remains unmerged and undeployed by instruction. No push to `dev`, merge, release, or deployment was performed.
- [ ] Factory registration and runtime binding: Factory maintainer gate after #122 build/review, actual serving, rollback identity, and authorized DEV acceptance.
- [ ] Integration callers and scoped workspace access: integration maintainer must identify legacy callers and issue scoped access before release.
- [ ] Hosted execution availability: billing owner; previous evidence was blocked before steps, not a code failure.
- [ ] Rollback of a pre-account API after account/brief data exists is unsafe. Maintainer owns containment/forward-fix gate while retaining PostgreSQL and additive records; no rollback artifact has been run against synthetic two-organization data.

## Release impact

Migration 006 is additive: historical/demo rows remain non-primary, the SQL defaults preserve old Brand inserts, and existing IDs, relations, ownership, and unrelated fields stay intact. API-first supports the previous frontend. Frontend-first remains gated until the compatible API serves. Retain the database and additive account/brief records on recovery. See [brand brief contract](brand-brief-contract.md) and [account workflow](accounts.md).
