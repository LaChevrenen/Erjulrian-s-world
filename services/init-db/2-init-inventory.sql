-- ###########################################
-- INVENTORY SERVICE DATABASE
-- ###########################################

-- Create user for inventory service
CREATE USER inventory_user WITH PASSWORD 'inventory_password';

-- ###########################################
-- INVENTORY SERVICE SCHEMA
-- ###########################################

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

-- ###########################################
-- INVENTORY SERVICE PERMISSIONS (RESTRICTIVE)
-- ###########################################

GRANT USAGE ON SCHEMA inventory_schema TO inventory_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA inventory_schema TO inventory_user;
ALTER ROLE inventory_user SET search_path TO inventory_schema, public;
