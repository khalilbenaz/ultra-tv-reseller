-- Type d'annonce choisi par le revendeur (étiquette affichée dans la boîte de réception de l'app).
ALTER TABLE message ADD COLUMN category TEXT NOT NULL DEFAULT 'info' CHECK (category IN ('info', 'maintenance', 'promo'));
