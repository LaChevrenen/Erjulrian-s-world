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

CREATE TABLE IF NOT EXISTS inventory_schema.Artifacts (
  id UUID PRIMARY KEY,
  name text NOT NULL,
  level int NOT NULL
);

INSERT INTO inventory_schema.Artifacts (id, name, level) VALUES
('550e8400-e29b-41d4-a716-446655440501', 'Pique-nique du Gobelin', 1),
('550e8400-e29b-41d4-a716-446655440502', 'Veste de Grand-mère', 1),
('550e8400-e29b-41d4-a716-446655440503', 'Jus de Betteraves Magique', 1),
('550e8400-e29b-41d4-a716-446655440504', 'Baguette Magique du Boulanger', 2),
('550e8400-e29b-41d4-a716-446655440505', 'Anneau du Mariage Raté', 2),
('550e8400-e29b-41d4-a716-446655440506', 'Casserole du Chef Fou', 3),
('550e8400-e29b-41d4-a716-446655440507', 'Zeste de Citron Ancien', 4),
('550e8400-e29b-41d4-a716-446655440508', 'Recette Secrète du Chaosma', 3),
('550e8400-e29b-41d4-a716-446655440509', 'Smoothie Énergétique Maudit', 2),
('550e8400-e29b-41d4-a716-446655440510', 'Médaille du Bizarre', 4),
('550e8400-e29b-41d4-a716-446655440511', 'Couronne de l''Absurdité', 5),
('550e8400-e29b-41d4-a716-446655440512', 'Filet à Crevette Louise', 4),
('550e8400-e29b-41d4-a716-446655440513', 'Écaille de Dragon Rancunier', 4),
('550e8400-e29b-41d4-a716-446655440514', 'Grimoire du Mage Myope', 3),
('550e8400-e29b-41d4-a716-446655440515', 'Relique Sainte du Prêtre Endormi', 3),
('550e8400-e29b-41d4-a716-446655440516', 'Hache d''Orc Affamé', 3),
('550e8400-e29b-41d4-a716-446655440517', 'Soie Tricotée de la Reine Arachnée', 3),
('550e8400-e29b-41d4-a716-446655440518', 'Armure du Chevalier Maladroit', 3),
('550e8400-e29b-41d4-a716-446655440519', 'Rouage du Robot Erwannito', 4),
('550e8400-e29b-41d4-a716-446655440520', 'Corne Magique de Juju', 4),
('550e8400-e29b-41d4-a716-446655440521', 'Cristal de Feu Follet', 2),
('550e8400-e29b-41d4-a716-446655440522', 'Pièce d''Or du Marchand Voleur', 2),
('550e8400-e29b-41d4-a716-446655440523', 'Épée du Petit Louis', 5),
('550e8400-e29b-41d4-a716-446655440524', 'Quenottes de Romain le Rusé', 4),
('550e8400-e29b-41d4-a716-446655440525', 'Cristal de Val de la Mort', 5),
('550e8400-e29b-41d4-a716-446655440526', 'Ouragan en Miniature de Toto', 5),
('550e8400-e29b-41d4-a716-446655440527', 'Gobelet du Gobelin Gourmet', 1),
('550e8400-e29b-41d4-a716-446655440528', 'Toque du Cuisinier Fou', 2),
('550e8400-e29b-41d4-a716-446655440529', 'Patte de Chevalier Sans-Gêne', 2),
('550e8400-e29b-41d4-a716-446655440530', 'Orbe de Chaos Élémentaire', 3),
('550e8400-e29b-41d4-a716-446655440531', 'Pierre de Protéine', 1),
('550e8400-e29b-41d4-a716-446655440532', 'Bague d''Invisibilité Cassée', 2),
('550e8400-e29b-41d4-a716-446655440533', 'Potion de Chance Légèrement Empoisonnée', 2),
('550e8400-e29b-41d4-a716-446655440534', 'Dague du Dimanche', 1),
('550e8400-e29b-41d4-a716-446655440535', 'Bouteille de Rhum Magique', 3),
('550e8400-e29b-41d4-a716-446655440536', 'Masque du Héros Humilié', 2),
('550e8400-e29b-41d4-a716-446655440537', 'Amulet de Trollface Invaincu', 4),
('550e8400-e29b-41d4-a716-446655440538', 'Sceptre de la Reine de la Nuit', 4),
('550e8400-e29b-41d4-a716-446655440539', 'Lunettes de Morgan', 4),
('550e8400-e29b-41d4-a716-446655440540', 'Chignon de Morgan', 4),
('550e8400-e29b-41d4-a716-446655440541', 'Insigne de Mr Charpentier', 5),
('550e8400-e29b-41d4-a716-446655440542', 'Lunettes Anti-Pigeon', 2),
('550e8400-e29b-41d4-a716-446655440543', 'Boulette de Pâte à Modeler', 1),
('550e8400-e29b-41d4-a716-446655440544', 'Bâton de Craie Sacré', 2)
ON CONFLICT (id) DO NOTHING;

-- ###########################################
-- INVENTORY SERVICE PERMISSIONS (RESTRICTIVE)
-- ###########################################

GRANT USAGE ON SCHEMA inventory_schema TO inventory_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory_schema TO inventory_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory_schema GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_user;
ALTER ROLE inventory_user SET search_path TO inventory_schema, public;
