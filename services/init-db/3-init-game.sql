-- ###########################################
-- GAME DATA DATABASE (Dungeon Service READ-ONLY)
-- ###########################################

-- Create user for dungeon service (read-only)
CREATE USER dungeon_user WITH PASSWORD 'dungeon_password';

-- ###########################################
-- GAME DATA SCHEMA (ARTIFACTS & MONSTERS)
-- ###########################################

CREATE SCHEMA IF NOT EXISTS game_schema;

-- Artifacts table
CREATE TABLE game_schema.Artifacts (
  id UUID PRIMARY KEY,
  name VARCHAR,
  level INT,
  hp_buff INT,
  att_buff INT,
  def_buff INT,
  regen_buff INT,
  description TEXT
);

-- Monsters table
CREATE TABLE game_schema.Monsters (
  id UUID PRIMARY KEY,
  name VARCHAR,
  type VARCHAR,
  description TEXT,
  hp INT,
  att INT,
  def INT,
  regen INT
);

-- Monster loot table
CREATE TABLE game_schema.MonsterLoot (
  monster_id UUID REFERENCES game_schema.Monsters(id) ON DELETE CASCADE,
  artifact_id UUID REFERENCES game_schema.Artifacts(id),
  chance FLOAT,
  amount INT,
  PRIMARY KEY (monster_id, artifact_id)
);

-- ###########################################
-- GAME DATA PERMISSIONS (READ-ONLY for dungeon)
-- ###########################################

GRANT USAGE ON SCHEMA game_schema TO dungeon_user;
GRANT SELECT ON ALL TABLES IN SCHEMA game_schema TO dungeon_user;
ALTER ROLE dungeon_user SET search_path TO game_schema, public;
