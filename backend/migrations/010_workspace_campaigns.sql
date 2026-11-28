ALTER TABLE campaigns
  ALTER COLUMN brand_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS posting_frequency VARCHAR(16),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS create_request_id UUID,
  ADD COLUMN IF NOT EXISTS create_request_fingerprint CHAR(64);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'campaigns'::regclass AND conname = 'campaigns_workspace_id_fkey') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES gm_auth_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'campaigns'::regclass AND conname = 'campaigns_duration_days_check') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_duration_days_check
      CHECK (duration_days IS NULL OR duration_days BETWEEN 7 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'campaigns'::regclass AND conname = 'campaigns_posting_frequency_check') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_posting_frequency_check
      CHECK (posting_frequency IS NULL OR posting_frequency IN ('low', 'medium', 'high'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'campaigns'::regclass AND conname = 'campaigns_create_request_pair_check') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_create_request_pair_check
      CHECK ((create_request_id IS NULL AND create_request_fingerprint IS NULL)
        OR (workspace_id IS NOT NULL AND create_request_id IS NOT NULL AND create_request_fingerprint IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'campaigns'::regclass AND conname = 'campaigns_owner_reference_check') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_owner_reference_check
      CHECK (brand_id IS NOT NULL OR workspace_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_campaigns_workspace_id ON campaigns (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_workspace_create_request
  ON campaigns (workspace_id, create_request_id)
  WHERE workspace_id IS NOT NULL AND create_request_id IS NOT NULL;
