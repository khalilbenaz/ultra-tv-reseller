-- Signature du contrat revendeur : nom complet saisi par le signataire (avec la date et la version déjà enregistrées).
ALTER TABLE reseller ADD COLUMN agreement_signer TEXT;
