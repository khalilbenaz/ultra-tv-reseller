-- Abonnement IPTV configuré par le revendeur pour un client (un par client), identifiants chiffrés (AES-256-GCM).
CREATE TABLE customer_source (
  customer_id TEXT PRIMARY KEY REFERENCES customer(id),
  kind TEXT NOT NULL CHECK (kind IN ('xtream', 'm3u')),
  name TEXT NOT NULL,
  enc TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);
