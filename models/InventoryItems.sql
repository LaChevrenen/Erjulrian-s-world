Table InventoryItems {
  id uuid [pk]
  hero_id uuid [ref: > Inventories.hero_id]
  artifact_id uuid [ref: > Artifacts.id]
  equipped boolean
  upgrade_level int
}