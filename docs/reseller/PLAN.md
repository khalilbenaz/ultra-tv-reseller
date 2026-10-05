# Programme revendeur — conception du pilote

> Dépôt **privé** `ultra-tv-reseller`, branche `reseller-pilot`. Rien de ce dossier ne doit partir sur le dépôt public
> (un hook `pre-push` local bloque les branches `reseller*` vers `ultra-tv`).

## 1. Ce qu'on construit (et ce qu'on ne construit pas)

Ultra TV reste un **lecteur neutre**. On ajoute un **système de licences d'utilisation de l'application**, vendu à des
revendeurs sous forme de **crédits prépayés**. Le revendeur gère ses clients depuis un **panneau revendeur**.

| Dans le pilote | Hors pilote (phase 2+) | Jamais |
|---|---|---|
| Comptes revendeurs, solde de crédits | Sous-revendeurs / distributeur (allocation de crédits) | Héberger ou fournir du contenu |
| Code appareil, essai, activation 1 an / 2 appareils, renouvellement, expiration | Notifications push (FCM) hors application | Encaisser les paiements des clients finaux |
| Rattachement permanent client → revendeur | Version personnalisée (marque blanche) industrialisée | Listes de chaînes préchargées dans l'app |
| Annonces + boîte de réception dans l'app (ciblées sur ses clients) | Statistiques avancées | Rappels de renouvellement **d'abonnement IPTV** (c'est son commerce) |
| Contact support du revendeur affiché dans l'app | Paiement en ligne des crédits | Promotion commune avec ses chaînes |

## 2. Décision produit — ✅ tranchée le 2026-10-05 : option A (version revendeur séparée)

**Où s'applique la licence ?** Si l'application publique gratuite fait la même chose sans licence, les clients du
revendeur l'installeront à la place : ses crédits ne valent rien.

| Option | Principe | Pour | Contre |
|---|---|---|---|
| **A. Variante « revendeur »** (recommandée pour le pilote) | Une variante de build (Android `productFlavor`, bureau : build séparé) avec l'écran de licence ; l'app publique reste gratuite et inchangée | Aucun risque pour les utilisateurs actuels ; base naturelle de la marque blanche | Deux builds à publier |
| B. App publique payante avec essai | Tout le monde passe par une licence | Un seul build | Change le modèle de l'app publique, utilisateurs actuels à migrer |
| C. Licence = fonctions premium seulement | Lecture gratuite, cloud/multi-appareils payants | Doux | Le revendeur ne contrôle pas l'accès : faible valeur pour lui |

## 3. Architecture

**Worker séparé `ultratv-reseller`** (dossier `reseller-worker/`, décision du 2026-10-05) : sa propre base D1, ses propres
secrets et sa propre adresse. Le Worker public `ultratv-config` n'est pas modifié. Raisons : isolation des pannes et du
périmètre juridique ; déplaçable tel quel vers un compte Cloudflare séparé (société dédiée) sans changer le code.
L'app revendeur appelle `ultratv-reseller` pour la licence et les annonces, et `ultratv-config` pour les fonctions cloud
existantes (appairage, sources, favoris). Les briques communes (chiffrement, nettoyage, HTTP, `Guard`) sont importées
depuis `cloudflare-config/src`.

### 3.1 Stockage

- **D1 (SQLite)** pour les données revendeur : il faut des requêtes (clients d'un revendeur, licences qui expirent) et des
  transactions (débit de crédit + création de licence **atomiques**, sinon double dépense possible).
- KV reste pour les comptes et appareils actuels (inchangé).

```sql
-- Revendeurs (un compte du tableau de bord avec le rôle revendeur)
CREATE TABLE reseller (id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  support_whatsapp TEXT, support_telegram TEXT, support_text TEXT,
  status TEXT NOT NULL DEFAULT 'active',          -- active | suspended
  parent_id TEXT REFERENCES reseller(id),         -- phase 2 : sous-revendeur
  agreement_signed_at INTEGER, created_at INTEGER NOT NULL);

-- Grand livre des crédits (jamais de solde modifié en place : somme des mouvements)
CREATE TABLE credit_ledger (id INTEGER PRIMARY KEY, reseller_id TEXT NOT NULL REFERENCES reseller(id),
  delta INTEGER NOT NULL,                         -- +50 achat, -1 activation, +1 remboursement
  reason TEXT NOT NULL,                           -- purchase | activation | renewal | refund | adjust | transfer
  ref TEXT, note TEXT, created_at INTEGER NOT NULL, created_by TEXT NOT NULL);

-- Client final (créé à la première activation), rattaché DÉFINITIVEMENT à un revendeur
CREATE TABLE customer (id TEXT PRIMARY KEY, reseller_id TEXT NOT NULL REFERENCES reseller(id),
  label TEXT, note TEXT, created_at INTEGER NOT NULL);

-- Licence : 1 client, 1 an, 2 appareils
CREATE TABLE license (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customer(id),
  starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, max_devices INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active');         -- active | suspended | revoked

-- Appareil installé (enregistré au premier lancement, avant toute activation)
CREATE TABLE device (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL,   -- code court affiché (ex. 7F3K-92QD)
  install_secret_hash TEXT NOT NULL, platform TEXT, model TEXT, app_version TEXT,
  customer_id TEXT REFERENCES customer(id), trial_ends_at INTEGER NOT NULL,
  last_seen_at INTEGER, created_at INTEGER NOT NULL);

-- Annonces
CREATE TABLE message (id TEXT PRIMARY KEY, reseller_id TEXT NOT NULL REFERENCES reseller(id),
  target TEXT NOT NULL,                           -- all | customer:<id>
  title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER);
CREATE TABLE message_read (message_id TEXT, device_id TEXT, read_at INTEGER, PRIMARY KEY (message_id, device_id));
```

### 3.2 API appareil (application)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/lic/register` | Premier lancement : crée `device` (code court + secret d'installation), démarre l'essai. Limité par IP (DO `GUARD`). |
| GET | `/api/lic/status` | Statut : `trial` / `active` / `expired` / `suspended`, date de fin, nom et contact du revendeur, nombre de messages non lus. Réponse **signée** (Ed25519) pour un contrôle hors ligne. |
| GET | `/api/lic/inbox` | Annonces destinées à l'appareil (toutes celles du revendeur + celles du client). |
| POST | `/api/lic/inbox/read` | Marque lu. |

- **Hors ligne** : l'app garde le dernier statut signé et l'accepte jusqu'à `expires_at` + 3 jours de grâce.
- **Fraude** : un APK modifié peut toujours sauter l'écran ; le levier serveur est que le panneau, la configuration à
  distance et la boîte de réception ne servent que les appareils licenciés. On ne vise pas l'inviolable, on vise
  « plus simple de payer que de contourner ».

### 3.3 Panneau revendeur (pages du tableau de bord, rôle revendeur)

- **Tableau de bord** : solde, activations du mois, licences qui expirent sous 30 jours.
- **Activer** : saisir le code appareil → choisir client existant ou nouveau → débite 1 crédit → licence 1 an.
  Deuxième appareil du même client : rattaché à sa licence **sans crédit** (2 appareils max).
- **Clients** : liste, recherche, appareils, expiration, renouveler (1 crédit, +1 an depuis la fin actuelle),
  suspendre / réactiver, détacher un appareil (changement de box).
- **Annonces** : rédiger, cibler (tous / un client), historique, taux de lecture.
- **Profil** : nom affiché, WhatsApp / Telegram / texte de support.
- **Admin (toi)** : créer un revendeur, ajouter des crédits (après paiement reçu), suspendre, voir le grand livre.

### 3.4 Application (Android TV/mobile + bureau)

- Écran « Activer Ultra TV » : code appareil en grand + QR, jours d'essai restants, contact du revendeur s'il est connu.
- Bandeau d'expiration (J-15) et écran bloquant à l'expiration (lecture désactivée, réglages accessibles).
- **Boîte de réception** : icône avec pastille dans le menu, liste des annonces, bandeau au lancement pour une annonce non lue.
- « Contacter le support » : ouvre WhatsApp/Telegram (mobile/bureau), affiche un QR sur TV.

## 4. Garde-fous juridiques intégrés au produit

1. **Contrat revendeur accepté avant le premier crédit** (`agreement_signed_at`) : il garantit les droits sur le contenu
   qu'il distribue, reste seul responsable de ses clients et abonnements ; suspension possible à tout moment.
2. **Aucun contenu, aucune liste préchargée** dans l'app ou le panneau. La configuration à distance des comptes existe
   déjà pour un utilisateur et ses propres sources ; **dans le pilote, le revendeur ne pousse pas de sources** vers ses
   clients (option à réévaluer avec le juriste).
3. **Facturation = vente de licences logicielles** à prix fixe, prépayées. Pas de pourcentage sur ses ventes.
4. **Suspension en un clic** d'un revendeur (toutes ses licences passent en `suspended`).
5. Conditions d'utilisation de l'app mises à jour (rôle de simple lecteur, interdiction de contenus sans droits).
6. Données personnelles minimales : aucun nom ni téléphone de client obligatoire (`label` libre), pas d'adresse IP stockée.

## 5. Découpage et estimation (temps partiel)

| Étape | Contenu | Estimation |
|---|---|---|
| 0 | Décision §2, contrat revendeur relu par un juriste, grille de prix | — (toi) |
| 1 ✅ | D1 + schéma + API `register` / `status` signé + tests (16) — `reseller-worker/` | fait le 2026-10-05 |
| 2 | Panneau : admin crédits, activation, clients, renouvellement, suspension | 5–6 jours |
| 3 | App : écran d'activation, contrôle hors ligne, expiration (Android + bureau) | 4–5 jours |
| 4 | Annonces : panneau + boîte de réception dans l'app | 3–4 jours |
| 5 | Contact support, finitions, recette avec 2–3 vrais appareils du revendeur | 2–3 jours |
| **Total pilote** | | **≈ 4 à 6 semaines** à temps partiel |

## 6. Questions ouvertes

- ~~Option §2~~ → **A retenue** : variante de build « revendeur » (Android `productFlavor` + build bureau séparé), l'app publique reste gratuite et inchangée.
- Durée d'essai et délai de grâce hors ligne : **7 jours / 3 jours par défaut** (`TRIAL_MS`, `GRACE_MS` dans `reseller-worker/src/license.js`).
- Changement de box : détachement libre par le revendeur, ou limité (ex. 2 par an) ?
- Remboursement d'un crédit si activation annulée sous 48 h ?
- Marque blanche : nom/logo/couleurs par revendeur — dans le pilote ou après ?
