Table MonsterLoot {
  monster_id uuid [ref: > Monsters.id]
  artifact_id uuid [ref: > Artifacts.id]
  chance float
  amount int

  indexes {
    (monster_id, artifact_id) [pk]
  }
}
