Table Users {
  id uuid [pk]
  email varchar [unique]
  username varchar
  password_hash varchar
  created_at timestamp
}