CREATE TABLE IF NOT EXISTS goodmarketing_brand_appearances (
  organization_id VARCHAR(128) PRIMARY KEY REFERENCES gm_auth_organizations(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  template_key VARCHAR(40),
  color_1 CHAR(7) NOT NULL CHECK (color_1 ~ '^#[0-9A-Fa-f]{6}$'),
  color_2 CHAR(7) NOT NULL CHECK (color_2 ~ '^#[0-9A-Fa-f]{6}$'),
  color_3 CHAR(7) NOT NULL CHECK (color_3 ~ '^#[0-9A-Fa-f]{6}$'),
  color_4 CHAR(7) NOT NULL CHECK (color_4 ~ '^#[0-9A-Fa-f]{6}$'),
  color_5 CHAR(7) NOT NULL CHECK (color_5 ~ '^#[0-9A-Fa-f]{6}$'),
  logo_bytes BYTEA,
  logo_sha256 CHAR(64),
  logo_size INTEGER CHECK (logo_size IS NULL OR (logo_size BETWEEN 1 AND 1048576)),
  logo_width SMALLINT CHECK (logo_width IS NULL OR (logo_width BETWEEN 1 AND 1024)),
  logo_height SMALLINT CHECK (logo_height IS NULL OR (logo_height BETWEEN 1 AND 1024)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((logo_bytes IS NULL AND logo_sha256 IS NULL AND logo_size IS NULL AND logo_width IS NULL AND logo_height IS NULL)
      OR (logo_bytes IS NOT NULL AND logo_sha256 IS NOT NULL AND logo_size = octet_length(logo_bytes)
          AND logo_width IS NOT NULL AND logo_height IS NOT NULL))
);
