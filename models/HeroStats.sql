Table HeroStats {
  hero_id uuid [pk]

  level int
  xp int

  base_hp int
  current_hp int
  base_att int
  base_def int
  base_regen int
  updated_at timestamp

}