-- Nombre d'appareils par licence : plafond fixé par l'administrateur (ou le distributeur pour ses sous-revendeurs),
-- choix du revendeur client par client dans cette limite. Rappels de renouvellement automatiques (0 = désactivés).
ALTER TABLE reseller ADD COLUMN max_devices_cap INTEGER NOT NULL DEFAULT 5;
ALTER TABLE reseller ADD COLUMN reminder_days INTEGER NOT NULL DEFAULT 15;
