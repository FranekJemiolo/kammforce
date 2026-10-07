export const SCHEMA_VERSION = 3;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS motorcycles (
  id                TEXT PRIMARY KEY,
  make              TEXT NOT NULL,
  model             TEXT NOT NULL,
  year              INTEGER NOT NULL,
  wheelbase_mm      INTEGER,
  rake_deg          REAL,
  trail_mm          INTEGER,
  cog_height_mm     INTEGER,
  mass_kg           INTEGER,
  max_mech_lean_deg INTEGER,
  cog_source        TEXT,
  oem_front_tire    TEXT,
  oem_rear_tire     TEXT
);
CREATE INDEX IF NOT EXISTS idx_motorcycles_make ON motorcycles(make, year);

CREATE TABLE IF NOT EXISTS tires (
  id           TEXT PRIMARY KEY,
  brand        TEXT,
  model        TEXT,
  width_mm     INTEGER,
  aspect_ratio INTEGER,
  rim_size_in  INTEGER
);

-- position: 'front' | 'rear'; tire_size like '120_70_17'
CREATE TABLE IF NOT EXISTS motorcycle_tire_fitments (
  motorcycle_id TEXT NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
  position      TEXT NOT NULL CHECK (position IN ('front','rear')),
  tire_size     TEXT NOT NULL,
  PRIMARY KEY (motorcycle_id, position, tire_size)
);
`;
