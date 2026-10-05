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
- ajouter des crédits après paiement (négatif = correction, jamais en dessous de zéro), avec une note de référence ;
- suspendre / réactiver un revendeur (coupe toutes ses licences), réinitialiser son mot de passe, consulter le grand livre.

**Revendeur** :
- accepter le contrat (obligatoire avant toute activation) ;
- **activer** un code appareil (nouveau client : 1 crédit ; 2ᵉ appareil d'un client : gratuit) ;
- clients : renouveler (+1 an depuis la fin actuelle, 1 crédit), suspendre / reprendre, détacher un appareil (changement de box), libellé et note ;
- **annonces** à tous ses clients ou à un client, avec durée de visibilité et nombre de lectures ;
- profil : nom affiché, WhatsApp, Telegram, texte de support (montrés dans l'application).

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
  liste préchargée, pas de sources poussées par le revendeur, facturation de licences logicielles uniquement, suspension en
  un clic, données personnelles minimales. Le texte du contrat (page `/agreement`) est à faire relire par un juriste.

## Développement

```bash
cd reseller-worker && npm ci && npm test          # Worker : 43 tests (D1 et Durable Object simulés)
cd web && npm ci && npm test                      # bureau / web (dont logique de licence)
cd web && VITE_EDITION=pro npm run build          # web en édition Pro
cd electron && npm ci && npm test && npm run package:pro:win   # installateur Windows Pro local
cd android-native && ./gradlew testDebugUnitTest assembleRelease -PULTRA_EDITION=pro   # (SDK Android requis)
```
