-- Existing owner memberships predate the Adapters permission gate. Grant the
-- explicit write capability to those owners while leaving viewers read-only.
UPDATE gm_auth_memberships
SET permissions = CASE
  WHEN permissions::jsonb ? 'marketing:write' THEN permissions
  ELSE (permissions::jsonb || '["marketing:write"]'::jsonb)::json
END
WHERE roles::jsonb ? 'owner';
