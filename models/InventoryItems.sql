Table InventoryItems {
    hero_id uuid [ref: > Inventories.hero_id]
  artifact_id uuid [ref: > Artifacts.id]
  quantity int
  equipped boolean
}