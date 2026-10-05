-- Programme revendeur : licences d'utilisation de l'application (aucun contenu).
-- Voir docs/reseller/PLAN.md. Le solde de crédits n'est jamais stocké : c'est la somme du grand livre.

CREATE TABLE reseller (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  support_whatsapp TEXT,
  support_telegram TEXT,
  support_text TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  parent_id TEXT REFERENCES reseller(id),
  agreement_signed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE credit_ledger (
  id INTEGER PRIMARY KEY,
  reseller_id TEXT NOT NULL REFERENCES reseller(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('purchase', 'activation', 'renewal', 'refund', 'adjust', 'transfer')),
  ref TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX credit_ledger_reseller ON credit_ledger (reseller_id, created_at);

CREATE TABLE customer (
  id TEXT PRIMARY KEY,
  reseller_id TEXT NOT NULL REFERENCES reseller(id),
  label TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX customer_reseller ON customer (reseller_id);

CREATE TABLE license (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id),
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked'))
);
CREATE INDEX license_customer ON license (customer_id, expires_at);

CREATE TABLE device (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  install_secret_hash TEXT UNIQUE NOT NULL,
  platform TEXT,
  model TEXT,
  app_version TEXT,
  customer_id TEXT REFERENCES customer(id),
  trial_ends_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX device_customer ON device (customer_id);

CREATE TABLE message (
  id TEXT PRIMARY KEY,
  reseller_id TEXT NOT NULL REFERENCES reseller(id),
  target TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE INDEX message_reseller ON message (reseller_id, created_at);

CREATE TABLE message_read (
  message_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, device_id)
);
