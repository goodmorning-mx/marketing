ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16),
  ADD COLUMN IF NOT EXISTS link_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS create_request_id UUID,
  ADD COLUMN IF NOT EXISTS create_request_fingerprint CHAR(64),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'content_items'::regclass AND conname = 'content_items_managed_kind_check') THEN
    ALTER TABLE content_items ADD CONSTRAINT content_items_managed_kind_check
      CHECK (kind IS NULL OR kind IN ('text', 'link', 'photo', 'reel'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'content_items'::regclass AND conname = 'content_items_managed_status_check') THEN
    ALTER TABLE content_items ADD CONSTRAINT content_items_managed_status_check
      CHECK (kind IS NULL OR status IN ('draft', 'review', 'approved'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'content_items'::regclass AND conname = 'content_items_idempotency_pair_check') THEN
    ALTER TABLE content_items ADD CONSTRAINT content_items_idempotency_pair_check
      CHECK ((create_request_id IS NULL AND create_request_fingerprint IS NULL)
        OR (kind IS NOT NULL AND create_request_id IS NOT NULL AND create_request_fingerprint IS NOT NULL));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_campaign_create_request
  ON content_items (campaign_id, create_request_id)
  WHERE create_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_content_items_managed_live
  ON content_items (campaign_id, id) WHERE kind IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS content_media (
  id BIGSERIAL PRIMARY KEY,
  content_id INTEGER NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
  workspace_id VARCHAR(128) NOT NULL REFERENCES gm_auth_organizations(id) ON DELETE CASCADE,
  media_kind VARCHAR(16) NOT NULL CHECK (media_kind IN ('photo', 'reel')),
  media_type VARCHAR(32) NOT NULL CHECK (media_type IN ('image/jpeg', 'video/mp4')),
  filename VARCHAR(180) NOT NULL,
  media_bytes BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 33554432),
  sha256 CHAR(64) NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((media_kind = 'photo' AND media_type = 'image/jpeg' AND size_bytes <= 8000000)
      OR (media_kind = 'reel' AND media_type = 'video/mp4'))
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'content_media'::regclass AND conname = 'content_media_workspace_id_fkey') THEN
    ALTER TABLE content_media ADD CONSTRAINT content_media_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES gm_auth_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'content_media'::regclass AND conname = 'content_media_media_kind_check') THEN
    ALTER TABLE content_media ADD CONSTRAINT content_media_media_kind_check CHECK (media_kind IN ('photo', 'reel'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'content_media'::regclass AND conname = 'content_media_media_type_check') THEN
    ALTER TABLE content_media ADD CONSTRAINT content_media_media_type_check CHECK (media_type IN ('image/jpeg', 'video/mp4'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'content_media'::regclass AND conname = 'content_media_size_bytes_check') THEN
    ALTER TABLE content_media ADD CONSTRAINT content_media_size_bytes_check CHECK (size_bytes > 0 AND size_bytes <= 33554432);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'content_media'::regclass AND conname = 'content_media_check') THEN
    ALTER TABLE content_media ADD CONSTRAINT content_media_check
      CHECK ((media_kind = 'photo' AND media_type = 'image/jpeg' AND size_bytes <= 8000000)
          OR (media_kind = 'reel' AND media_type = 'video/mp4'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_content_media_workspace_id ON content_media (workspace_id);
