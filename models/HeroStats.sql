Table HeroStats {
  hero_id uuid [pk]

  level int
  xp int

  base_hp int
  base_att int
  base_def int
  base_regen int

  artifact_slot_1 int
  artifact_slot_2 int
  artifact_slot_3 int
  artifact_slot_4 int
  updated_at timestamp

}