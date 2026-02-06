
CREATE USER inventory_user WITH PASSWORD 'inventory_password';
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
  level int NOT NULL,
  hp_buff int DEFAULT 0,
  att_buff int DEFAULT 0,
  def_buff int DEFAULT 0,
  regen_buff int DEFAULT 0
);

INSERT INTO inventory_schema.Artifacts (id, name, level, hp_buff, att_buff, def_buff, regen_buff) VALUES
('550e8400-e29b-41d4-a716-446655440501', 'Pique-nique du Gobelin', 1, 0, 2, 0, 0),
('550e8400-e29b-41d4-a716-446655440502', 'Veste de Grand-mère', 1, 5, 0, 2, 0),
('550e8400-e29b-41d4-a716-446655440503', 'Jus de Betteraves Magique', 1, 10, 0, 0, 0),
('550e8400-e29b-41d4-a716-446655440504', 'Baguette Magique du Boulanger', 2, 0, 5, 1, 0),
('550e8400-e29b-41d4-a716-446655440505', 'Anneau du Mariage Raté', 2, 0, 1, 0, 2),
('550e8400-e29b-41d4-a716-446655440506', 'Casserole du Chef Fou', 3, 10, 0, 4, 0),
('550e8400-e29b-41d4-a716-446655440507', 'Zeste de Citron Ancien', 4, 0, 10, 2, 0),
('550e8400-e29b-41d4-a716-446655440508', 'Recette Secrète du Chaosma', 3, 0, 6, 0, 1),
('550e8400-e29b-41d4-a716-446655440509', 'Smoothie Énergétique Maudit', 2, 5, 3, 1, 1),
('550e8400-e29b-41d4-a716-446655440510', 'Médaille du Bizarre', 4, 20, 0, 3, 3),
('550e8400-e29b-41d4-a716-446655440511', 'Couronne de l''Absurdité', 5, 30, 5, 5, 5),
('550e8400-e29b-41d4-a716-446655440512', 'Filet à Crevette Louise', 4, 15, 8, 2, 0),
('550e8400-e29b-41d4-a716-446655440513', 'Écaille de Dragon Rancunier', 4, 8, 6, 8, 1),
('550e8400-e29b-41d4-a716-446655440514', 'Grimoire du Mage Myope', 3, 0, 7, 2, 2),
('550e8400-e29b-41d4-a716-446655440515', 'Relique Sainte du Prêtre Endormi', 3, 12, 3, 3, 3),
('550e8400-e29b-41d4-a716-446655440516', 'Hache d''Orc Affamé', 3, 5, 9, 1, 0),
('550e8400-e29b-41d4-a716-446655440517', 'Soie Tricotée de la Reine Arachnée', 3, 10, 2, 6, 0),
('550e8400-e29b-41d4-a716-446655440518', 'Armure du Chevalier Maladroit', 3, 15, 1, 8, 0),
('550e8400-e29b-41d4-a716-446655440519', 'Rouage du Robot Erwannito', 4, 5, 5, 7, 2),
('550e8400-e29b-41d4-a716-446655440520', 'Corne Magique de Juju', 4, 25, 3, 4, 0),
('550e8400-e29b-41d4-a716-446655440521', 'Cristal de Feu Follet', 2, 0, 6, 0, 3),
('550e8400-e29b-41d4-a716-446655440522', 'Pièce d''Or du Marchand Voleur', 2, 0, 2, 0, 1),
('550e8400-e29b-41d4-a716-446655440523', 'Épée du Petit Louis', 5, 40, 15, 8, 4),
('550e8400-e29b-41d4-a716-446655440524', 'Quenottes de Romain le Rusé', 4, 12, 10, 3, 1),
('550e8400-e29b-41d4-a716-446655440525', 'Cristal de Val de la Mort', 5, 50, 5, 15, 8),
('550e8400-e29b-41d4-a716-446655440526', 'Ouragan en Miniature de Toto', 5, 20, 20, 6, 2),
('550e8400-e29b-41d4-a716-446655440527', 'Gobelet du Gobelin Gourmet', 1, 3, 1, 1, 1),
('550e8400-e29b-41d4-a716-446655440528', 'Toque du Cuisinier Fou', 2, 8, 4, 2, 0),
('550e8400-e29b-41d4-a716-446655440529', 'Patte de Chevalier Sans-Gêne', 2, 8, 4, 5, 0),
('550e8400-e29b-41d4-a716-446655440530', 'Orbe de Chaos Élémentaire', 3, 6, 8, 2, 5),
('550e8400-e29b-41d4-a716-446655440531', 'Pierre de Protéine', 1, 8, 0, 0, 0),
('550e8400-e29b-41d4-a716-446655440532', 'Bague d''Invisibilité Cassée', 2, 0, 3, 5, 0),
('550e8400-e29b-41d4-a716-446655440533', 'Potion de Chance Légèrement Empoisonnée', 2, 3, 2, 2, 1),
('550e8400-e29b-41d4-a716-446655440534', 'Dague du Dimanche', 1, 2, 2, 1, 0),
('550e8400-e29b-41d4-a716-446655440535', 'Bouteille de Rhum Magique', 3, 15, 4, 2, 2),
('550e8400-e29b-41d4-a716-446655440536', 'Masque du Héros Humilié', 2, 10, 5, 6, 1),
('550e8400-e29b-41d4-a716-446655440537', 'Amulet de Trollface Invaincu', 4, 18, 7, 7, 3),
('550e8400-e29b-41d4-a716-446655440538', 'Sceptre de la Reine de la Nuit', 4, 10, 12, 3, 2),
('550e8400-e29b-41d4-a716-446655440539', 'Lunettes de Morgan', 4, 8, 3, 5, 0),
('550e8400-e29b-41d4-a716-446655440540', 'Chignon de Morgan', 4, 15, 2, 3, 3),
('550e8400-e29b-41d4-a716-446655440541', 'Insigne de Mr Charpentier', 5, 20, 12, 10, 4),
('550e8400-e29b-41d4-a716-446655440542', 'Lunettes Anti-Pigeon', 2, 0, 3, 5, 0),
('550e8400-e29b-41d4-a716-446655440543', 'Boulette de Pâte à Modeler', 1, 8, 1, 1, 2),
('550e8400-e29b-41d4-a716-446655440544', 'Bâton de Craie Sacré', 2, 5, 4, 2, 1)
ON CONFLICT (id) DO NOTHING;
GRANT USAGE ON SCHEMA inventory_schema TO inventory_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory_schema TO inventory_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory_schema GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_user;
ALTER ROLE inventory_user SET search_path TO inventory_schema, public;
