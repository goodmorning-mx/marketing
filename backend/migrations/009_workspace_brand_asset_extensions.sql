ALTER TABLE goodmarketing_brand_appearances
  ADD COLUMN IF NOT EXISTS palette_source VARCHAR(8) NOT NULL DEFAULT 'template' CHECK (palette_source IN ('template', 'custom')),
  ADD COLUMN IF NOT EXISTS custom_palette JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(custom_palette) = 'array' AND jsonb_array_length(custom_palette) <= 5),
  ADD COLUMN IF NOT EXISTS custom_palette_filename VARCHAR(255);

CREATE TABLE IF NOT EXISTS goodmarketing_brand_fonts (
  organization_id VARCHAR(128) NOT NULL REFERENCES gm_auth_organizations(id) ON DELETE CASCADE,
  font_id UUID NOT NULL,
  filename VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  media_type VARCHAR(40) NOT NULL CHECK (media_type IN ('font/woff', 'font/woff2', 'font/ttf', 'font/otf')),
  font_bytes BYTEA NOT NULL,
  sha256 CHAR(64) NOT NULL,
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 1048576 AND size = octet_length(font_bytes)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, font_id)
);
