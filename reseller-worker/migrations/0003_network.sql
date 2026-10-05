-- Phase 2 : réseau de distribution (distributeur → sous-revendeurs, 2 niveaux), prolongation d'essai.
-- Un distributeur est un revendeur avec is_distributor = 1 ; ses sous-revendeurs ont parent_id = son id.
ALTER TABLE reseller ADD COLUMN is_distributor INTEGER NOT NULL DEFAULT 0;
CREATE INDEX reseller_parent ON reseller (parent_id);
-- Essai prolongé une seule fois par appareil (geste commercial gratuit).
ALTER TABLE device ADD COLUMN trial_extended INTEGER NOT NULL DEFAULT 0;
