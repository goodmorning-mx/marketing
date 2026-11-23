# Brand Brief persistence contract

The workspace Brand Brief is stored in the existing `brands` table. `Brand.name`,
`summary`, `audience`, `tone`, and `goal` hold the five customer-authored text
fields. `goodmarketing_workspace_profiles.display_name` remains the separate
workspace label. Existing Brand IDs, relationships, ownership, and unrelated
columns are preserved. Migration 006 adds `is_primary BOOLEAN NOT NULL DEFAULT
false`, `revision INTEGER NOT NULL DEFAULT 1`, and a partial unique index on
`(tenant_id) WHERE is_primary`. Historical/demo Brands are never assigned to a
customer workspace. Old inserts inherit the SQL defaults and remain non-primary.

## Read and write

`GET /workspace/brand-brief` requires verified `workspace:read` access and
returns `{ "brief": null }` or the saved brief. The strong quoted ETag is a
SHA-256 digest of the workspace-scoped representation and contains no customer
text. Responses use `Cache-Control: private, no-store`. Credentialed CORS exposes
`ETag` and permits `If-Match`.

`PUT /workspace/brand-brief` requires the verified organization, `owner`, and
`marketing:write`. It accepts only `brand_name`, `description`, `audience`,
`voice_tone`, and `primary_goal`; name must be nonblank and at most 160
characters, tone at most 240, and the remaining fields can be cleared. Submitted
wording is retained. It requires the exact strong ETag from GET: missing returns
428, unsupported validators return 400, and stale representations return 412.
An empty-state insert uses the partial unique index and cannot turn a losing
concurrent insert into an update. Existing rows update by organization, primary
row, and revision in one transaction and advance revision atomically.

`PATCH /api/brands/{id}` retains the historical request schema and requires its legacy `name` field; fields omitted from the JSON body are preserved. Primary brief-affecting edits
require the same `If-Match`, update the same five fields atomically, and advance
the revision. Authenticated integrations obtain the correct validator and primary Brand ID from `GET /workspace/brand-brief`, then use that validator on `PATCH /api/brands/{id}`. Historical Adapters response bodies remain unchanged.
Non-primary Brand PATCH behavior remains compatible. All Brand reads/writes use
the verified organization; caller tenant selectors and identity headers are not
authoritative. Tool access remains organization-scoped and owner-gated for writes.

## Browser

The account bootstrap must finish before loading the form. Empty state stays
empty; viewers can read but receive no edit controls. On successful save the
browser GETs the committed representation and then reloads the full page. A
failed PUT retains the draft. A lost response causes a read before any retry; a
changed server version with different text requires reconciliation. If the
confirmation GET fails, the browser keeps the draft and offers a GET-only retry.
A workspace-scoped session navigation status can report that save succeeded if
the following bootstrap fails; it contains no customer text and clears after a
confirmed load. Logo, colors, fonts, and templates are previews, not persisted
assets. Language switches change labels only.

## Release and recovery

Frontend-first deployment with the old API cannot complete brief reads or saves;
keep the account page gated until the compatible API is available. API-first is
backward-compatible with the old frontend because routes and columns are
additive. After customer briefs exist, rolling back to a pre-account API is not
a safe recovery because it removes account and brief routes. The maintainer must
use a forward fix or contain traffic while retaining PostgreSQL and its additive
records. Rollback must be verified against migrated synthetic data for two
organizations before release; no such production rollback has been performed by
this candidate.
