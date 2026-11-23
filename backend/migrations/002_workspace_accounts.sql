CREATE TABLE IF NOT EXISTS goodmarketing_workspace_profiles (
  organization_id VARCHAR(128) PRIMARY KEY REFERENCES gm_auth_organizations(id),
  display_name VARCHAR(120) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS goodmarketing_invitations (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  organization_id VARCHAR(128) NOT NULL REFERENCES gm_auth_organizations(id),
  roles JSONB NOT NULL,
  permissions JSONB NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS goodmarketing_invitations_email_idx ON goodmarketing_invitations (email);
