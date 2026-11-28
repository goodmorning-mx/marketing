CREATE TABLE IF NOT EXISTS demo_requests (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  company VARCHAR(160) NOT NULL,
  role VARCHAR(120) NOT NULL,
  website VARCHAR(240),
  goals TEXT NOT NULL,
  market VARCHAR(120) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  qualification_status VARCHAR(24) NOT NULL DEFAULT 'new',
  admin_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS demo_requests_submitted_at_idx ON demo_requests (submitted_at DESC);
