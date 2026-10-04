-- Applied automatically on first use (lib/server/db.ts). Run manually if the app user cannot create tables.
CREATE TABLE IF NOT EXISTS studio_docs(
  kind text NOT NULL,
  id text NOT NULL,
  parent_id text NOT NULL DEFAULT '',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kind,id)
);
CREATE INDEX IF NOT EXISTS studio_docs_parent ON studio_docs(kind,parent_id,updated_at);
