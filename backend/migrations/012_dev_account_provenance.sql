ALTER TABLE goodmarketing_workspace_profiles
  ADD COLUMN IF NOT EXISTS dev_managed_owner_user_id VARCHAR(128);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'goodmarketing_workspace_profiles'::regclass
      AND conname = 'goodmarketing_workspace_profiles_dev_owner_fkey'
  ) THEN
    ALTER TABLE goodmarketing_workspace_profiles
      ADD CONSTRAINT goodmarketing_workspace_profiles_dev_owner_fkey
      FOREIGN KEY (dev_managed_owner_user_id) REFERENCES gm_auth_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_profiles_dev_managed_owner
  ON goodmarketing_workspace_profiles (dev_managed_owner_user_id)
  WHERE dev_managed_owner_user_id IS NOT NULL;
