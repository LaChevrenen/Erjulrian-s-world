-- Create the user for each services
CREATE USER inventory_user WITH PASSWORD 'inventory_password';
CREATE USER hero_user WITH PASSWORD 'hero_password';
CREATE USER user_user WITH PASSWORD 'user_password';

-- ###########################################
-- REVOKE DEFAULT ACCESS
-- ###########################################

-- Make sure every user accessing the DB has no default access to public schema
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO admin;

-- ###########################################
-- GAME DATA SCHEMA (ARTIFACTS & MONSTERS)
-- ###########################################

-- Creation of the schema for game data
CREATE SCHEMA game_schema AUTHORIZATION admin;

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
-- GAME DATA PERMISSIONS
-- ###########################################

GRANT USAGE ON SCHEMA game_schema TO inventory_user;
GRANT USAGE ON SCHEMA game_schema TO hero_user;
GRANT SELECT ON ALL TABLES IN SCHEMA game_schema TO inventory_user;
GRANT SELECT ON ALL TABLES IN SCHEMA game_schema TO hero_user;

-- ###########################################
-- INVENTORY SERVICE SCHEMA
-- ###########################################

-- Creation of the schema for inventory service
CREATE SCHEMA inventory_schema AUTHORIZATION admin;

CREATE TABLE inventory_schema.Inventories (
  hero_id char(36) PRIMARY KEY,
  gold int
);

CREATE TABLE inventory_schema.InventoryItems (
  hero_id char(36),
  artifact_id UUID,
  quantity int,
  equipped boolean,
  PRIMARY KEY (hero_id, artifact_id),
  FOREIGN KEY (hero_id) REFERENCES inventory_schema.Inventories(hero_id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_id) REFERENCES game_schema.Artifacts(id)
);

-- ###########################################
-- INVENTORY SERVICE PERMISSIONS
-- ###########################################

-- Set permissions for inventory service user on inventory schema
GRANT USAGE, CREATE ON SCHEMA inventory_schema TO inventory_user;
GRANT USAGE ON SCHEMA inventory_schema TO inventory_user;

-- Set permissions on tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA inventory_schema TO admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory_schema TO inventory_user;

-- Set visibility on sequences
ALTER ROLE admin SET search_path TO inventory_schema, public;
ALTER ROLE inventory_user SET search_path TO inventory_schema, public;

-- ###########################################
-- HERO SERVICE SCHEMA
-- ###########################################

-- Creation of the schema for hero service
CREATE SCHEMA hero_schema AUTHORIZATION admin;

-- ###########################################
-- HERO SERVICE TABLES
-- ###########################################

-- Table HeroStats
CREATE TABLE hero_schema.HeroStats (
  hero_id UUID PRIMARY KEY,
  level INT DEFAULT 1,
  xp INT DEFAULT 0,
  base_hp INT DEFAULT 20,
  base_att INT DEFAULT 4,
  base_def INT DEFAULT 1,
  base_regen INT DEFAULT 1,
  artifact_slot_1 UUID REFERENCES game_schema.Artifacts(id),
  artifact_slot_2 UUID REFERENCES game_schema.Artifacts(id),
  artifact_slot_3 UUID REFERENCES game_schema.Artifacts(id),
  artifact_slot_4 UUID REFERENCES game_schema.Artifacts(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ###########################################
-- HERO SERVICE PERMISSIONS
-- ###########################################

-- Set permissions for hero service user on hero schema
GRANT USAGE, CREATE ON SCHEMA hero_schema TO hero_user;
GRANT USAGE ON SCHEMA hero_schema TO hero_user;

-- Set permissions on tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA hero_schema TO admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA hero_schema TO hero_user;

-- Set visibility on sequences
ALTER ROLE admin SET search_path TO hero_schema, public;
ALTER ROLE hero_user SET search_path TO hero_schema, public;

-- ###########################################

-- ###########################################
-- USER SERVICE SCHEMA
-- ###########################################

CREATE SCHEMA user_schema AUTHORIZATION admin;

-- ###########################################
-- USER SERVICE TABLES
-- ###########################################

CREATE TABLE user_schema.Users (
  id UUID PRIMARY KEY,
  username VARCHAR(255)
);

GRANT USAGE, CREATE ON SCHEMA user_schema TO user_user;
GRANT USAGE ON SCHEMA user_schema TO user_user;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA user_schema TO admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA user_schema TO user_user;

ALTER ROLE admin SET search_path TO user_schema, public;
ALTER ROLE user_user SET search_path TO user_schema, public;

-- ###########################################