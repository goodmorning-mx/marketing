# Customer accounts on DEV

GoodMarketing installs `gm-auth` v0.1.5 from commit
`138d66cb44a94781e0d38d8afd1be2dbf718c294`. The module owns user identities,
organizations, memberships, roles, password hashes, and sessions. GoodMarketing
adds hashed invitation records and a workspace display-name profile.

## Runtime configuration

The API requires `DATABASE_URL`, `CORS_ORIGINS`, and the runtime secret
`AUTH_JWT_SECRET` (minimum 32 characters). Factory provisions the signing value
as a generated backend secret. `AUTH_COOKIE_DOMAIN` is `dev.marketing.goodmorning.mx`
so the frontend can verify its session with the API; both session cookies are
Secure, HttpOnly, and SameSite=Lax. The frontend uses `VITE_API_URL` for its
Nginx session check. Never commit secret values or invitation links.

Staff invitation issuance uses the existing `ADMIN_USERNAME` and
`ADMIN_PASSWORD` API credentials on `/admin/`. The admin page creates a link for
a named email, workspace, role, and expiry. Staff deliver the link manually.
The link token is only in its URL fragment, is hashed at rest, and is removed
from the browser address bar before activation. No mail delivery is configured.

Roles are `owner` and `viewer`. Both can read their own workspace profile and
organization-owned Adapters records. Owners can update the workspace display
name and customer data; viewers are read-only. The API derives the organization
from the verified gm-auth access token. Legacy `tenant_id` selectors and
`X-GM-*` identity/permission headers are ignored for authority. Cookie-auth
mutations also require an exact allowed `Origin`; trusted server integrations
may use a verified bearer token. Historical Adapters paths and payload schemas
remain compatible, with authentication and organization ownership now required.
Historical `demo` rows are not reassigned to customers.

## Schema and migration

On API startup, the backend serializes additive setup and records each step in
`goodmarketing_schema_migrations`:

1. The pinned gm-auth package metadata creates gm-auth identity, organization,
   membership, and session tables. The application does not maintain a second
   copy of the gm-auth schema SQL.
2. Marketing SQLAlchemy metadata creates missing Adapters tables. Existing
   tables and rows from the historical Alembic migrations are retained.
3. `002_workspace_accounts.sql` creates workspace profiles and invitations.
4. `003_demo_requests.sql` ensures the public demo-request table exists.
5. `004_marketing_strategy_fields.sql` idempotently adds fields that may be
   absent from earlier Adapters schemas, including `audience`.
6. `005_owner_marketing_permissions.sql` adds `marketing:write` to existing
   owner memberships; viewer permissions are unchanged.
7. `006_primary_brand_brief.sql` adds the non-primary SQL default and revision
   fields plus the per-organization primary Brand index. Existing rows remain
   non-primary and old inserts keep their established behavior.

These steps are safe to replay. The gm-auth migration uses the approved
v0.1.5 package metadata, which matches the tables created by the historical
gm-auth Alembic revision. The historical application mounted gm-auth's
bearer-token router; this release does not mount that router because the account
flow needs secure cookie sessions. GoodMarketing owns the HTTP cookie and invite
routes, while gm-auth remains the sole identity, password, membership, token,
and refresh-session service. The backend must have its existing private
PostgreSQL `DATABASE_URL` before it starts. Schema setup does not require the
generated secret, but account endpoints stay unavailable until Factory provides
`AUTH_JWT_SECRET`. Do not point DEV at production storage.

## Rollback

Before any release, verify both deployment orders with the release maintainer.
API-first is compatible with the prior frontend. Frontend-first must remain
protected and cannot save until the compatible API is serving. Once customer
account or Brand Brief records exist, rolling back to a pre-account API is not a
safe recovery because it removes the account and brief routes. The maintainer
must contain traffic or forward-fix while retaining PostgreSQL and additive
records. Verify any proposed rollback artifact against migrated synthetic data
for two organizations before release. No production rollback is authorized by
this candidate.

## Adapters authorization contract

All `/api/brands`, `/api/campaigns`, `/api/content`, `/api/connections/*`,
`/api/publish/*`, and `/api/tools/invoke` data paths require verified customer
identity and `workspace:read`. Writes additionally require `marketing:write`.
Brand selection uses the authenticated organization; campaign and content
access is scoped through parent joins, including status and publish mutations.
Tool context is built from the verified gm-auth identity and mapped permissions,
never from request identity headers. `/api/tools` exposes metadata only but is
also restricted to an authenticated workspace.

The 14 historical HTTP operations and their payload/response schemas remain in
place. Authorization is the intentional compatibility change: existing
integrations must send a valid gm-auth bearer token for the target organization;
there is no unauthenticated or header-trusting fallback. Historical integration
callers must be issued workspace memberships and scoped credentials before the
account release is enabled.
