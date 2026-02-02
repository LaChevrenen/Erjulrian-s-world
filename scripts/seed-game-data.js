const path = require('path');
const { Client } = require('pg');

const artifacts = require(path.join(__dirname, '..', 'data', 'artifacts.json'));
const monsters = require(path.join(__dirname, '..', 'data', 'monsters.json'));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'toto123',
  database: process.env.DB_NAME || 'erjulrian_db'
};

async function seed() {
  const client = new Client(dbConfig);
  await client.connect();

  try {
    await client.query('BEGIN');

    for (const artifact of artifacts) {
      await client.query(
        `INSERT INTO game_schema.Artifacts
          (id, name, level, hp_buff, att_buff, def_buff, regen_buff, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           level = EXCLUDED.level,
           hp_buff = EXCLUDED.hp_buff,
           att_buff = EXCLUDED.att_buff,
           def_buff = EXCLUDED.def_buff,
           regen_buff = EXCLUDED.regen_buff,
           description = EXCLUDED.description`,
        [
          artifact.id,
          artifact.name,
          artifact.level,
          artifact.hp_buff,
          artifact.att_buff,
          artifact.def_buff,
          artifact.regen_buff,
          artifact.description
        ]
      );
    }

    for (const monster of monsters) {
      await client.query(
        `INSERT INTO game_schema.Monsters
          (id, name, type, description, hp, att, def, regen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           type = EXCLUDED.type,
           description = EXCLUDED.description,
           hp = EXCLUDED.hp,
           att = EXCLUDED.att,
           def = EXCLUDED.def,
           regen = EXCLUDED.regen`,
        [
          monster._id,
          monster.name,
          monster.type,
          monster.description,
          monster.stats?.hp ?? 0,
          monster.stats?.att ?? 0,
          monster.stats?.def ?? 0,
          monster.stats?.regen ?? 0
        ]
      );

      const lootTable = Array.isArray(monster.lootTable) ? monster.lootTable : [];
      for (const loot of lootTable) {
        await client.query(
          `INSERT INTO game_schema.MonsterLoot
            (monster_id, artifact_id, chance, amount)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (monster_id, artifact_id) DO UPDATE SET
             chance = EXCLUDED.chance,
             amount = EXCLUDED.amount`,
          [
            monster._id,
            loot.itemId,
            loot.chance,
            loot.amount ?? 1
          ]
        );
      }
    }

    await client.query('COMMIT');
    console.log('✓ Game data seeded successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed game data:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

seed();
