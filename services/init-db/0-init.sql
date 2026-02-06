CREATE USER inventory_user WITH PASSWORD 'inventory_password';
CREATE USER hero_user WITH PASSWORD 'hero_password';
CREATE USER user_user WITH PASSWORD 'user_password';
CREATE USER dungeon_user WITH PASSWORD 'dungeon_password';

REVOKE ALL ON SCHEMA public FROM PUBLIC;
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
GRANT USAGE ON SCHEMA game_schema TO inventory_user;
GRANT USAGE ON SCHEMA game_schema TO hero_user;
GRANT USAGE ON SCHEMA game_schema TO dungeon_user;
GRANT SELECT ON ALL TABLES IN SCHEMA game_schema TO inventory_user;
GRANT SELECT ON ALL TABLES IN SCHEMA game_schema TO hero_user;
GRANT SELECT ON ALL TABLES IN SCHEMA game_schema TO dungeon_user;
CREATE SCHEMA IF NOT EXISTS hero_schema;
CREATE TABLE hero_schema.HeroStats (
  hero_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  level INT DEFAULT 1,
  xp INT DEFAULT 0,
  base_hp INT DEFAULT 20,
  current_hp INT DEFAULT 20,
  base_att INT DEFAULT 4,
  base_def INT DEFAULT 1,
  base_regen INT DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hero_user_id ON hero_schema.HeroStats(user_id);
GRANT USAGE ON SCHEMA hero_schema TO hero_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA hero_schema TO hero_user;
ALTER ROLE admin SET search_path TO hero_schema, public;
ALTER ROLE hero_user SET search_path TO hero_schema, public;
CREATE SCHEMA IF NOT EXISTS inventory_schema;

CREATE TABLE inventory_schema.Inventories (
  hero_id UUID PRIMARY KEY,
  gold int,
  equipped_count int DEFAULT 0
);

CREATE TABLE inventory_schema.InventoryItems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_id UUID,
  artifact_id UUID,
  equipped boolean,
  upgrade_level int DEFAULT 0,
  UNIQUE (hero_id, artifact_id, upgrade_level)
);

GRANT USAGE ON SCHEMA inventory_schema TO inventory_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA inventory_schema TO inventory_user;
ALTER ROLE admin SET search_path TO inventory_schema, public;
ALTER ROLE inventory_user SET search_path TO inventory_schema, public;

CREATE SCHEMA IF NOT EXISTS user_schema;

CREATE TABLE user_schema.Users (
  id UUID PRIMARY KEY,
  username VARCHAR(255),
  is_admin BOOLEAN
);

GRANT USAGE, CREATE ON SCHEMA user_schema TO user_user;
GRANT USAGE ON SCHEMA user_schema TO user_user;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA user_schema TO admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA user_schema TO user_user;

ALTER ROLE admin SET search_path TO user_schema, public;
ALTER ROLE user_user SET search_path TO user_schema, public;
