CREATE USER dungeon_user WITH PASSWORD 'dungeon_password';
CREATE SCHEMA IF NOT EXISTS game_schema;
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
CREATE TABLE game_schema.MonsterLoot (
  monster_id UUID REFERENCES game_schema.Monsters(id) ON DELETE CASCADE,
  artifact_id UUID REFERENCES game_schema.Artifacts(id),
  chance FLOAT,
  amount INT,
  PRIMARY KEY (monster_id, artifact_id)
);
GRANT USAGE ON SCHEMA game_schema TO dungeon_user;
GRANT SELECT ON ALL TABLES IN SCHEMA game_schema TO dungeon_user;
ALTER ROLE dungeon_user SET search_path TO game_schema, public;
