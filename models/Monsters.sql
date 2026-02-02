Table Monsters {
  id uuid [pk]
  name varchar
  type varchar        // goblin, orc, dragon, etc
  description text

  hp int
  att int
  def int
  regen int
}