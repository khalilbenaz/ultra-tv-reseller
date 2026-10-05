-- Panneau : connexion des revendeurs et de l'administrateur, version du contrat accepté.
ALTER TABLE reseller ADD COLUMN password_hash TEXT;
ALTER TABLE reseller ADD COLUMN role TEXT NOT NULL DEFAULT 'reseller' CHECK (role IN ('reseller', 'admin'));
ALTER TABLE reseller ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reseller ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reseller ADD COLUMN agreement_version TEXT;
CREATE INDEX device_code ON device (code);
