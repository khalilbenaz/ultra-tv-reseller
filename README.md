# Ultra TV Pro — programme revendeur (dépôt privé)

> Dépôt **privé**. L'application publique et gratuite vit dans [`khalilbenaz/ultra-tv`](https://github.com/khalilbenaz/ultra-tv) ;
> ce dépôt en est une copie enrichie de l'**édition Pro** (licences vendues par des revendeurs) et du **Worker revendeur**.
> Rien d'ici ne doit partir vers le dépôt public (voir [Garde-fous](#garde-fous)).

## En bref

Ultra TV Pro est **le même lecteur** qu'Ultra TV, avec une couche de licence :

- au premier lancement, l'application affiche un **code appareil** (ex. `7F3K-92QD`) et démarre un **essai de 7 jours** ;
- le revendeur active ce code depuis son **panneau** : **1 crédit = 1 client, 1 an, 2 appareils** ;
- à l'expiration ou en cas de suspension, l'application se bloque et affiche le **contact du revendeur** ;
- le revendeur envoie des **annonces** à ses clients (affichées à l'ouverture de l'application).

**Modèle économique** : crédits **prépayés** vendus au revendeur, prix fixe, pas de partage de revenus. Ultra TV Pro ne
fournit, n'héberge et ne vend **aucun contenu** ; chaque revendeur accepte un **contrat** (contenu sous licence) avant sa
première activation.

## Règles métier

Règles appliquées par le Worker `ultratv-reseller` (et vérifiées par ses tests). Toute évolution d'une règle doit être
reportée ici.

### Rôles

| Rôle | Créé par | Peut |
|---|---|---|
| **Administrateur** (`admin`) | à l'installation | Créer revendeurs et distributeurs, ajouter / corriger des crédits, suspendre, réinitialiser un mot de passe, promouvoir / rétrograder un distributeur, voir les grands livres |
| **Distributeur** | l'administrateur | Tout ce que fait un revendeur + créer des sous-revendeurs, leur transférer / reprendre des crédits, les suspendre, écrire à tout son réseau |
| **Revendeur** | l'administrateur | Accepter le contrat, activer, renouveler, gérer ses clients, envoyer des annonces, exporter |
| **Sous-revendeur** | son distributeur | Comme un revendeur ; ses crédits viennent de son distributeur ; ne peut pas créer de sous-revendeur |

- Deux niveaux au maximum : distributeur → sous-revendeurs.
- Un distributeur ne voit et ne gère que **ses** sous-revendeurs ; un revendeur que **ses** clients.
- Un distributeur ne peut pas être rétrogradé tant qu'il a des sous-revendeurs.

### Comptes et connexion

- Identifiant : 3 à 32 caractères (lettres minuscules, chiffres, `.`, `_`, `-`), unique.
- Tout nouveau compte reçoit un **mot de passe provisoire affiché une seule fois** ; il doit être changé à la première
  connexion (10 caractères minimum). Changer ou réinitialiser un mot de passe ferme les autres sessions.
- Tentatives de connexion limitées : 10 par IP / 15 min, 20 par identifiant / heure.

### Contrat revendeur

- Obligatoire avant la **première activation** (revendeurs et sous-revendeurs ; l'administrateur n'en a pas besoin).
- Le revendeur garantit que le contenu qu'il distribue est **sous licence** ; il reste seul responsable de ses services,
  abonnements et clients. Ultra TV Pro ne fournit, n'héberge ni ne vend aucun contenu.
- Texte : page `/agreement` du panneau (version `AGREEMENT_VERSION` dans `reseller-worker/src/panel.js`).

### Crédits

- **Prépayés** : l'administrateur ajoute des crédits après paiement, avec une note de référence.
- **1 crédit = 1 client pendant 1 an, jusqu'à 2 appareils**, ou **1 renouvellement d'1 an**.
- Le solde est la **somme du grand livre** (jamais stocké) ; chaque mouvement est tracé : achat, activation,
  renouvellement, transfert, correction.
- **Jamais de solde négatif**, jamais de crédit dépensé deux fois, même en cas de clics simultanés.
- Correction négative par l'administrateur possible, dans la limite du solde.
- Un crédit utilisé n'est pas remboursé.

### Appareils, essai et activation

- Au premier lancement, l'application reçoit un **code appareil** `XXXX-XXXX` (sans 0/O ni 1/I/L) et un **essai gratuit
  de 7 jours**.
- **Activation d'un nouveau client** : 1 crédit, licence d'**1 an** à partir de l'activation, **2 appareils** maximum.
- **Deuxième appareil** d'un client : gratuit, si sa licence est active et qu'il reste une place.
- **Changement de box** : le revendeur détache l'ancien appareil, la place se libère pour un nouveau code.
- Un code déjà activé ne peut pas être activé à nouveau (ni par un autre revendeur).
- **Activation en lot** : jusqu'à 200 codes, résultat par code ; s'arrête dès que les crédits manquent.
- **Prolongation d'essai** : +7 jours, **gratuite, une seule fois par appareil**, seulement si l'appareil n'est pas activé.
- Un client appartient **définitivement** au revendeur qui l'a activé.

### Renouvellement et expiration

- Renouveler = 1 crédit = **+1 an à partir de la fin actuelle** (ou d'aujourd'hui si la licence a déjà expiré).
- À l'expiration, l'application se bloque et affiche le code de l'appareil et le contact du revendeur ;
  bandeau d'avertissement dans l'application 15 jours avant.

### Suspension

| Action | Effet | Les clients |
|---|---|---|
| L'administrateur suspend un **revendeur** | Plus d'accès au panneau, plus d'activation ni de renouvellement | **Gardent leur licence jusqu'à expiration** |
| L'administrateur suspend un **distributeur** | Idem pour lui **et tout son réseau** (sous-revendeurs) | **Gardent leur licence jusqu'à expiration** |
| Un distributeur suspend un **sous-revendeur** | Plus d'accès ni d'activation pour ce sous-revendeur | **Gardent leur licence jusqu'à expiration** |
| Un revendeur suspend **un client** (fiche client) | Ce client est bloqué (tous ses appareils) | Seul ce client ; réversible (« Resume ») |

Principe : **un client a payé sa période, elle est toujours honorée.** Seule la suspension explicite d'un client le bloque.
Exception : décision d'un tribunal ou d'une autorité compétente (contrat §6).

### Réseau de distribution

- Le distributeur **transfère** des crédits de son solde vers un sous-revendeur, ou **reprend** des crédits inutilisés ;
  chaque transfert crée deux lignes de grand livre (débit / crédit) de même référence : rien n'est créé ni perdu.
- Le distributeur revend ses crédits au prix qu'il veut, **hors plateforme** ; l'éditeur ne facture que le distributeur.
- Le distributeur voit pour chaque sous-revendeur : solde, clients, activations des 30 derniers jours, dernière activation ;
  il ne voit pas le détail de leurs clients.

### Abonnement IPTV configuré par le revendeur

- Le revendeur saisit le **code affiché sur l'écran du client** (ou ouvre la fiche du client) puis l'abonnement :
  **Xtream Codes** (serveur, identifiant, mot de passe) ou **lien M3U**. Un abonnement par client, valable pour tous ses appareils.
- L'appareil doit d'abord être **activé** par ce revendeur ; un revendeur ne peut configurer que **ses** clients.
- L'application Pro récupère l'abonnement au démarrage puis **toutes les 15 minutes** : la source est ajoutée et
  synchronisée sans rien saisir sur la TV, mise à jour si le revendeur la modifie, retirée s'il la supprime.
  Les sources ajoutées par le client lui-même ne sont jamais touchées.
- Identifiants **chiffrés au repos** (AES-256-GCM, secret `PROVIDER_ENC_KEY`, lié au client) ; le mot de passe n'est
  jamais réaffiché dans le panneau (laisser vide = inchangé) ; envoyés en clair uniquement aux appareils de ce client,
  et **seulement si sa licence est active** (rien en essai ni si le client est suspendu).
- Rappel juridique : ce sont les identifiants d'abonnement du revendeur ; le contrat (§3) le rend seul responsable du
  contenu correspondant.

### Annonces

- Cibles : **tous mes clients**, **un client**, ou (distributeur) **tout mon réseau**.
- Durée de visibilité : 1, 7, 30 jours ou sans fin ; titre 120 caractères, message 2 000.
- Affichées à l'ouverture de l'application, une à la fois ; « OK » les marque lues ; le panneau indique le nombre de lectures.

### Application et hors ligne

- Le statut de licence est **signé (Ed25519)** par le Worker et vérifié par l'application avec la clé publique embarquée.
- Contrôle au démarrage puis toutes les 6 heures ; **hors ligne**, le dernier statut signé reste valable jusqu'à
  **3 jours** après la fin de la licence ou de l'essai (délai de grâce).
- Une horloge d'appareil reculée ne prolonge pas une licence.
- Le menu **Abonnement** montre la licence (statut, fin, jours restants, code, revendeur, contact) et l'abonnement IPTV.

### Données

- Aucune donnée personnelle obligatoire : un client est identifié par un **libellé libre** et ses codes appareil.
- Aucune adresse IP stockée ; le secret d'installation d'un appareil n'est conservé que haché.
- Exports **CSV** (clients, historique des crédits) : cellules neutralisées contre l'injection de formules.

## En production

| Élément | Adresse |
|---|---|
| Panneau revendeur et administration | https://ultratv-reseller.khalilbenaz.workers.dev |
| Page de téléchargement (clients) | https://ultratv-reseller.khalilbenaz.workers.dev/download |
| Distribution des installateurs (public, sans code) | https://github.com/khalilbenaz/ultra-tv-pro/releases |
| Worker cloud commun (appairage, sources, favoris) | https://ultratv-config.khalilbenaz.workers.dev (dépôt public) |

## Architecture

```
 Ultra TV Pro (Android TV, Android, Windows, macOS, Linux)
   │  licence, statut signé, annonces          │  appairage, sources, préférences, favoris
   ▼                                           ▼
 Worker ultratv-reseller  (CE dépôt)        Worker ultratv-config  (dépôt public, inchangé)
   ├─ D1 « ultratv-reseller » : revendeurs, grand livre de crédits, clients, licences, appareils, annonces
   ├─ Durable Object Guard : limites de débit
   └─ Panneau HTML (revendeur en anglais, administration en français)
```

- **Worker indépendant** : son propre code (`reseller-worker/src/lib`), sa base, ses secrets, son adresse. Une panne ou une
  suspension côté revendeurs ne touche jamais le service public ; il peut être déplacé tel quel vers un autre compte Cloudflare.
- **Crédits** : jamais dépensés deux fois ni en négatif (lots D1 conditionnels, testés avec des activations simultanées).
- **Statut de licence signé Ed25519** : l'application vérifie la signature avec la clé publique embarquée et accepte le
  dernier statut **hors ligne** jusqu'à 3 jours après la fin (délai de grâce).

## Contenu du dépôt (spécifique à l'édition Pro)

| Chemin | Rôle |
|---|---|
| [`reseller-worker/`](reseller-worker/) | Worker revendeur : API `/api/lic/*`, panneau, administration, `/download`, migrations D1, tests |
| [`docs/reseller/PLAN.md`](docs/reseller/PLAN.md) | Conception, décisions, garde-fous juridiques, état d'avancement |
| `web/src/edition.ts`, [`web/src/license/`](web/src/license/) | Bureau : édition (`VITE_EDITION=pro`), porte de licence, carte licence |
| `web/src/screens/Account.tsx` | Menu « Abonnement » : compte IPTV (commun) + licence (Pro) |
| [`electron/electron-builder.pro.cjs`](electron/electron-builder.pro.cjs) | Bureau Pro : `com.ultratv.pro`, dossier de données et mises à jour séparés |
| `android-native/.../data/license/`, `.../ui/license/` | Android : client de licence, vérification Ed25519, écran d'activation, annonces, écran Abonnement |
| `android-native/app/build.gradle.kts` | `-PULTRA_EDITION=pro` : `com.ultratv.pro`, « Ultra TV Pro », URL et clé publique de licence |
| [`.github/workflows/pro-release.yml`](.github/workflows/pro-release.yml) | Build Pro sur tag `pro-vX.Y.Z` (APK signés clé Pro + installateurs bureau) |
| [`scripts/publish-pro.sh`](scripts/publish-pro.sh) | Publie un build dans le dépôt de distribution `ultra-tv-pro` |

Tout le reste (lecteur, synchro, catalogue, lecteur vidéo…) est **identique à l'application publique** et se met à jour
en fusionnant `main` (voir [Suivre l'application publique](#suivre-lapplication-publique)).

## Panneau

**Administrateur** (`admin`) :
- créer un revendeur (mot de passe provisoire affiché une fois, changement imposé à la première connexion) ;
- créer un **distributeur** (case à cocher) ou promouvoir un revendeur existant ;
- ajouter des crédits après paiement (négatif = correction, jamais en dessous de zéro), avec une note de référence ;
- suspendre / réactiver un revendeur (accès et activations ; ses clients gardent leur licence), réinitialiser son mot de passe, consulter le grand livre.

**Distributeur** (revendeur promu par l'administrateur, phase 2) — tout ce que fait un revendeur, plus le menu **Network** :
- créer des **sous-revendeurs** (mot de passe provisoire affiché une fois) ;
- leur **transférer** des crédits depuis son solde, ou **reprendre** des crédits inutilisés (jamais de solde négatif) ;
- suivre leur activité (solde, clients, activations sur 30 jours, dernière activation) et les totaux du réseau ;
- **suspendre** un sous-revendeur (accès au panneau et nouvelles activations bloqués ; ses clients gardent leur licence jusqu'à expiration) ;
- envoyer une annonce à **tout son réseau** (clients de tous ses sous-revendeurs).
Si l'administrateur suspend un distributeur, tout son réseau perd l'accès au panneau et ne peut plus activer ni renouveler ;
**les clients ne sont jamais bloqués** : ils ont payé leur période, leur licence reste valide jusqu'à expiration.

**Revendeur** (ou sous-revendeur) :
- accepter le contrat (obligatoire avant toute activation) ;
- **activer** un code appareil (nouveau client : 1 crédit ; 2ᵉ appareil d'un client : gratuit) ;
- clients : renouveler (+1 an depuis la fin actuelle, 1 crédit), suspendre / reprendre, détacher un appareil (changement de box), libellé et note ;
- **annonces** à tous ses clients ou à un client, avec durée de visibilité et nombre de lectures ;
- profil : nom affiché, WhatsApp, Telegram, texte de support (montrés dans l'application).
- **activation en lot** (une liste de codes, résultat par code) ;
- **prolongation d'essai** : +7 jours, gratuite, une seule fois par appareil (pour laisser un prospect tester) ;
- **exports CSV** des clients et de l'historique des crédits.

## API appareil (application)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/lic/register` | Premier lancement → `{deviceId, code, installSecret, trialEndsAt}` (20 / h / IP) |
| GET | `/api/lic/status?v=<version>` | `Bearer <installSecret>` → `{payload, sig}` signé Ed25519 |
| GET | `/api/lic/inbox` | Annonces destinées à l'appareil |
| POST | `/api/lic/inbox/read` | `{ids}` : marquer lues |

Statuts : `trial`, `active`, `expired`, `suspended`. Détails : [`reseller-worker/README.md`](reseller-worker/README.md).

## Construire et publier une version Pro

1. Mettre à jour [`VERSION`](VERSION) (la version Pro suit celle de l'application publique).
2. Pousser la branche puis le tag **vers le dépôt privé** :
   ```bash
   git push reseller reseller-pilot
   git tag pro-vX.Y.Z && git push reseller pro-vX.Y.Z
   ```
   Le workflow **Pro release** construit Android (APK par ABI signés avec la clé Pro, vérification anti-clé de débogage)
   et le bureau (macOS universel, Windows x64, Linux x64), et dépose les fichiers en artefacts.
3. Publier dans le dépôt de distribution (sommes SHA-256 vérifiées, release `vX.Y.Z` marquée « latest ») :
   ```bash
   bash scripts/publish-pro.sh <id du run>
   ```
4. Les applications installées trouvent la mise à jour d'elles-mêmes (bureau : releases `vX.Y.Z` d'`ultra-tv-pro` ;
   Android : fichiers `UltraTVPro-<version>-<abi>.apk` + `SHA256SUMS.txt`).

**Worker** : `cd reseller-worker && npm test && npx wrangler deploy` ; nouvelles migrations :
`npx wrangler d1 migrations apply ultratv-reseller --remote`.

## Clés et secrets

| Secret | Où | Usage |
|---|---|---|
| `LICENSE_SIGNING_KEY` | secret Wrangler (`ultratv-reseller`) | Signe les statuts de licence (Ed25519) |
| `SESSION_SECRET` | secret Wrangler | Sessions du panneau |
| `PROVIDER_ENC_KEY` | secret Wrangler (copie : `~/.config/ultra-tv-pro/source-enc-key.b64`) | Chiffre les abonnements IPTV saisis par les revendeurs |
| `PRO_KEYSTORE_BASE64`, `PRO_KEYSTORE_PASSWORD`, `PRO_KEY_ALIAS` | secrets GitHub de ce dépôt | Signature des APK Pro |
| Copies locales | `~/.config/ultra-tv-pro/` (jamais dans le dépôt) | Clé de signature, keystore Android Pro, mot de passe admin initial |

⚠️ **Sauvegarder `~/.config/ultra-tv-pro/`** : sans le keystore, impossible de publier une mise à jour Android installable
par-dessus ; sans la clé de signature, il faut republier les applications avec une nouvelle clé publique.
La clé **publique** de licence est dans [`reseller-worker/keys/license-public.b64`](reseller-worker/keys/license-public.b64)
et embarquée dans les applications.

## Suivre l'application publique

Les correctifs et nouveautés de l'application publique arrivent par fusion de `main` :

```bash
git checkout main && git pull origin main
git checkout reseller-pilot && git merge main
```

En cas de conflit, garder la version Pro des fichiers propres à l'édition Pro (tableau ci-dessus) et la version publique
pour le reste. Après `git checkout main`, supprimer le dossier `reseller-worker/` resté sur le disque (non suivi sur `main`)
pour ne jamais l'ajouter par erreur au dépôt public.

## Garde-fous

- **Hook local `pre-push`** (dans `.git/hooks`, non versionné) : refuse d'envoyer une branche `reseller*` ou un tag
  `pro-v*` ailleurs que vers ce dépôt privé.
- Actions GitHub : seul **Pro release** est utile ici ; les workflows publics ne se déclenchent que sur `main`.
- **Juridique** (voir [PLAN.md §4](docs/reseller/PLAN.md)) : contrat revendeur accepté avant activation, aucun contenu ni
  liste préchargée dans l'application, abonnements IPTV saisis par le revendeur sous sa responsabilité (chiffrés), facturation de licences logicielles uniquement, suspension en
  un clic, données personnelles minimales. Le texte du contrat (page `/agreement`) est à faire relire par un juriste.

## Développement

```bash
cd reseller-worker && npm ci && npm test          # Worker : 65 tests (D1 et Durable Object simulés)
cd web && npm ci && npm test                      # bureau / web (dont logique de licence)
cd web && VITE_EDITION=pro npm run build          # web en édition Pro
cd electron && npm ci && npm test && npm run package:pro:win   # installateur Windows Pro local
cd android-native && ./gradlew testDebugUnitTest assembleRelease -PULTRA_EDITION=pro   # (SDK Android requis)
```
