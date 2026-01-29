Table Logs {
  id uuid [pk]
  level int
  timestamp timestamp
  service varchar
  event_type varchar
  payload json
}