Table Monsters {
  id int [pk, increment]
  name varchar
  type varchar        // normal, elite, boss
  hp int
  att int
  def int
  regen int

  artifact_id int 
  chance float
  quantity int

  description text
}