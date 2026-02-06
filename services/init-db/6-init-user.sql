CREATE USER user_user WITH PASSWORD 'user_password';
GRANT CONNECT ON DATABASE erjulrian_user TO user_user;
CREATE SCHEMA IF NOT EXISTS user_schema;
CREATE TABLE user_schema.Users (
  id UUID PRIMARY KEY,
  username VARCHAR(255),
  is_admin BOOLEAN
);
GRANT USAGE ON SCHEMA user_schema TO user_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA user_schema TO user_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA user_schema GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO user_user;
ALTER ROLE user_user SET search_path TO user_schema, public;