CREATE USER hero_user WITH PASSWORD 'hero_password';
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
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA hero_schema TO hero_user;
ALTER ROLE hero_user SET search_path TO hero_schema, public;
