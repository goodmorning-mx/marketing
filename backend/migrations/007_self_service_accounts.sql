CREATE TABLE IF NOT EXISTS goodmarketing_email_verifications (
  token_hash CHAR(64) PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS goodmarketing_email_verifications_expires_idx
  ON goodmarketing_email_verifications (expires_at);
CREATE INDEX IF NOT EXISTS goodmarketing_email_verifications_email_idx
  ON goodmarketing_email_verifications (email);

CREATE TABLE IF NOT EXISTS goodmarketing_account_limits (
  bucket CHAR(64) PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS goodmarketing_account_limits_expires_idx
  ON goodmarketing_account_limits (expires_at);
