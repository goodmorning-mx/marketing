CREATE TABLE IF NOT EXISTS goodmarketing_dev_enrollment (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  email VARCHAR(254),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
