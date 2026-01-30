Table InventoryItems {
  hero_id char(36) [ref: > Inventories.hero_id]
  artifact_id uuid [ref: > Artifacts.id]
  quantity int
  equipped boolean
}