# Brand Brief API contract (proposal)

This is the next persistence slice; this account PR does not implement it.

## Ownership and storage

- Use the existing `brands` row as the brief. Resolve it only through
  `Brand.tenant_id = verified_identity.organization_id`.
- Keep `goodmarketing_workspace_profiles.display_name` as the workspace label.
  `Brand.name` is the customer's brand name; neither field is copied into the
  other automatically.
- Add `brands.is_primary BOOLEAN NOT NULL DEFAULT false` and a partial unique
  index on `brands(tenant_id) WHERE is_primary`. Existing `demo` and historical
  rows remain untouched and are never assigned to a new workspace.
- A workspace with no primary row has a true empty state. Do not fill it with
  sample text or a demo Brand.

## Endpoints and permissions

- `GET /workspace/brand-brief` requires `workspace:read` and returns the
  primary row, or `{ "brief": null }` for the empty state.
- `PUT /workspace/brand-brief` requires `marketing:write`. The organization is
  derived from the verified identity; request tenant IDs are not accepted as
  authority. Map `brand_name -> Brand.name`, `description -> summary`,
  `audience -> audience`, `voice_tone -> tone`, and `primary_goal -> goal`.
- Do not widen permissions for existing viewer memberships. Owners receive
  `marketing:write` from the account role contract; viewers can read only.

## Save, reload, and stale edits

- Add a monotonic `version` integer to Brand and return it as an `ETag` from
  reads. Save requires `If-Match`; update atomically matches the current version
  and increments it. A missing/stale version returns `412 Precondition Failed`
  with the current version, so one tab cannot silently replace newer edits.
- Create the primary Brand under the unique partial index in a transaction.
  Repeated saves update the same row; handle a concurrent first-save uniqueness
  race by re-reading the workspace's primary row and applying the version check.
- A successful PUT means PostgreSQL committed. The page then immediately GETs
  the endpoint and replaces the form with the confirmed API representation,
  without a manual refresh.
- A failed PUT keeps all entered text and shows a save error. If PUT succeeds
  but the follow-up GET fails, say that the save succeeded but reload failed;
  keep the entered values visible and offer a reload retry. Do not report this
  state as an unsaved change.
- Save only the five text fields above. Logo, color, font, and template assets
  need a separate asset-storage slice and must not be represented as persisted.

## Focused follow-up

Implement the additive primary-Brand fields/index and the two authenticated
endpoints with PostgreSQL 16 tests for empty state, repeated save, owner/viewer
permissions, cross-organization access, and stale `If-Match`; then connect the
Brand Brief form to save followed by automatic API reload.
