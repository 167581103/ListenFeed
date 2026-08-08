CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE feed_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  mime_type text NOT NULL DEFAULT 'audio/mpeg',
  byte_size integer NOT NULL CHECK (byte_size > 0),
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  content_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  eyebrow text NOT NULL,
  level text NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  question text NOT NULL,
  explanation text NOT NULL,
  audio_asset_id uuid NOT NULL REFERENCES audio_assets(id),
  status feed_status NOT NULL DEFAULT 'draft',
  sort_rank integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feed_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  option_key text NOT NULL CHECK (option_key ~ '^[a-z]$'),
  label text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  position smallint NOT NULL,
  UNIQUE (feed_item_id, option_key),
  UNIQUE (feed_item_id, position)
);

CREATE TABLE transcript_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  speaker_key text NOT NULL,
  speaker_label text NOT NULL,
  line text NOT NULL,
  position smallint NOT NULL,
  start_ms integer,
  end_ms integer,
  UNIQUE (feed_item_id, position)
);

CREATE INDEX feed_items_published_order_idx
  ON feed_items (sort_rank DESC, published_at DESC)
  WHERE status = 'published';

CREATE INDEX feed_options_item_idx ON feed_options (feed_item_id, position);
CREATE INDEX transcript_lines_item_idx ON transcript_lines (feed_item_id, position);

COMMENT ON TABLE audio_assets IS
  'Only media metadata lives in Postgres. Audio bytes are immutable CDN objects and never proxy through Vercel Functions.';
