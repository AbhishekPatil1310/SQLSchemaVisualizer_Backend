CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES user_connections(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notes_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT notes_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT notes_description_word_limit CHECK (
    cardinality(regexp_split_to_array(btrim(description), '\s+')) <= 10000
  )
);

CREATE INDEX IF NOT EXISTS idx_notes_connection_id ON notes(connection_id);

CREATE OR REPLACE FUNCTION enforce_max_10_notes_per_connection()
RETURNS trigger AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM notes
    WHERE connection_id = NEW.connection_id
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
  ) >= 10 THEN
    RAISE EXCEPTION 'A connection can have at most 10 notes';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_max_10_notes_per_connection ON notes;
CREATE TRIGGER trg_max_10_notes_per_connection
BEFORE INSERT OR UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION enforce_max_10_notes_per_connection();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notes_set_updated_at ON notes;
CREATE TRIGGER trg_notes_set_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
