-- Sentence listening is a first-class content mode. Quiz items keep their
-- required choices; sentence items store timed lines, translations, and terms.

ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS learning_mode text NOT NULL DEFAULT 'quiz';
ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_learning_mode_check;
ALTER TABLE feed_items
  ADD CONSTRAINT feed_items_learning_mode_check
  CHECK (learning_mode IN ('quiz', 'sentence-listening'));

ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS proficiency text;

ALTER TABLE transcript_lines ADD COLUMN IF NOT EXISTS translation text;
ALTER TABLE transcript_lines ADD COLUMN IF NOT EXISTS terms text[];
