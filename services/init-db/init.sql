-- Create the user for each services
CREATE USER inventory_user WITH PASSWORD 'inventory_password';

-- Creation of the schema for inventory service
CREATE SCHEMA inventory_schema AUTHORIZATION admin;

-- MAke sure every user accessing the DB has no default access to public schema
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO admin;

-- ##################################
-- Table inventory
CREATE TABLE inventory_schema.Inventories (
  hero_id char(36) PRIMARY KEY,
  gold int
);

CREATE TABLE inventory_schema.InventoryItems (
  hero_id char(36),
  artifact_id char(36),
  quantity int,
  equipped boolean
);

-- Set permissions for each user on inventory schema
GRANT USAGE, CREATE ON SCHEMA inventory_schema TO inventory_user;
GRANT USAGE ON SCHEMA inventory_schema TO inventory_user;

-- Set permissions on tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA inventory_schema TO admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory_schema TO inventory_user;

-- Set visibility on sequences
ALTER ROLE admin SET search_path TO inventory_schema, public;
ALTER ROLE inventory_user SET search_path TO inventory_schema, public;

-- ###########################################
