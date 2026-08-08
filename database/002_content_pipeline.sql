-- Content pipeline: extends the core schema (001) for the CMS / content factory.
-- The static frontend never reads these tables; the publish job projects
-- published rows into static snapshots. All statements are idempotent so the
-- migration runner can re-apply safely.

-- Lifecycle: generated -> draft -> reviewing -> published -> archived.
ALTER TYPE feed_status ADD VALUE IF NOT EXISTS 'generated' BEFORE 'draft';
ALTER TYPE feed_status ADD VALUE IF NOT EXISTS 'reviewing' AFTER 'draft';

-- feed_items: idempotent-import key, versioning, global publish order, features.
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS published_seq bigint;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS locale text;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS accent text;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS scenario text;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS format text;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS speech_rate integer;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS quality_score numeric;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS freshness_score numeric;

CREATE UNIQUE INDEX IF NOT EXISTS feed_items_external_id_key ON feed_items (external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS feed_items_published_seq_key ON feed_items (published_seq) WHERE published_seq IS NOT NULL;

-- Monotonic global publish order; assigned once when an item is first published.
CREATE SEQUENCE IF NOT EXISTS feed_publish_seq;

-- audio_assets: record the private master and the second (webm) encoding size.
ALTER TABLE audio_assets ADD COLUMN IF NOT EXISTS master_key text;
ALTER TABLE audio_assets ADD COLUMN IF NOT EXISTS webm_byte_size integer;

-- Tags (reserved for ranking/recall; lightly used now).
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'topic',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feed_item_tags (
  feed_item_id uuid NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (feed_item_id, tag_id)
);

-- Content version history (snapshot of the item at each version).
CREATE TABLE IF NOT EXISTS content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_item_id, version)
);

-- Batch import jobs + per-row results (for the async content factory pipeline).
CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  total integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS import_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  position integer NOT NULL,
  external_id text,
  status text NOT NULL,
  error text,
  retryable boolean NOT NULL DEFAULT false,
  feed_item_id uuid REFERENCES feed_items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS import_job_items_job_idx ON import_job_items (import_job_id, position);

-- Agentic generation provenance (reserved).
CREATE TABLE IF NOT EXISTS generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid REFERENCES feed_items(id) ON DELETE SET NULL,
  agent text,
  model text,
  prompt_version text,
  input_source text,
  cost_usd numeric,
  latency_ms integer,
  validation jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit trail for every content mutation.
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at);

-- Record of each published static snapshot.
CREATE TABLE IF NOT EXISTS publish_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version integer NOT NULL,
  page_count integer NOT NULL,
  item_count integer NOT NULL,
  max_seq bigint NOT NULL,
  storage_prefix text NOT NULL DEFAULT 'feed',
  generated_at timestamptz NOT NULL DEFAULT now()
);
