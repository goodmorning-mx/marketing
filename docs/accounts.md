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

Roles are `owner` and `viewer`. Both can read their own workspace profile;
owners can update that workspace's display name. The API derives the
organization from the authenticated gm-auth identity and checks its permissions
for each operation.

## Schema and migration

On API startup, the backend applies the additive SQL files under
`backend/migrations/` in order and records them in
`goodmarketing_schema_migrations`:

1. `001_gm_auth.sql` is the migration shipped with the pinned gm-auth release.
2. `002_workspace_accounts.sql` creates workspace profiles and invitations.

The migrations add tables and indexes and do not modify or delete existing demo
requests. The backend must have its existing private PostgreSQL `DATABASE_URL`
before it starts. Do not point DEV at production storage.

## Rollback

Roll back the API and frontend applications to the prior known-good Coolify
revisions. Leave the additive auth tables and records in PostgreSQL; the earlier
application does not use them, and deleting them would destroy customer account
state. Roll back the Factory manifest registration separately only if the
installation contract must be reverted. Verify `/health`, `/signup/`, and the
previous DEV workspace behavior after rollback. Reapplying the account release
uses the same versioned migration ledger and keeps existing rows.
