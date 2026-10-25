-- Contact form submissions. Personal data: keep columns to what the form asks for.
CREATE TABLE enquiries (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  organisation  TEXT,
  interest      TEXT NOT NULL,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'new',      -- new | contacted | closed
  email_status  TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  email_error   TEXT,
  ip_hash       TEXT                              -- salted hash, for rate limiting only
);
CREATE INDEX enquiries_created_at ON enquiries (created_at);
CREATE INDEX enquiries_ip_hash_created_at ON enquiries (ip_hash, created_at);
