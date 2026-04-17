CREATE TABLE IF NOT EXISTS number_one_songs (
  id BIGSERIAL PRIMARY KEY,
  was_number_one_from DATE NOT NULL,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  openai_blurb TEXT,
  blurb_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_number_one_songs_date
  ON number_one_songs (was_number_one_from);

CREATE UNIQUE INDEX IF NOT EXISTS ux_number_one_songs_date_title_artist
  ON number_one_songs (was_number_one_from, title, artist);
