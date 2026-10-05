# ultratv-reseller (privé)

Worker du programme revendeur : licences de la variante « revendeur » de l'application, panneau revendeur, annonces.
Conception : [`docs/reseller/PLAN.md`](../docs/reseller/PLAN.md). Séparé du Worker public `cloudflare-config`.

## API appareil (étape 1)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/lic/register` | Premier lancement : `{platform, model, appVersion}` → `{deviceId, code, installSecret, trialEndsAt}` (201). 20 / h / IP. |
| GET | `/api/lic/status?v=<version>` | `Authorization: Bearer <installSecret>` → `{payload, sig}` : charge utile JSON en base64url signée Ed25519. |

Charge utile : `{ v, deviceId, code, status: trial|active|expired|suspended, until, graceUntil, reseller: {name, whatsapp, telegram, text} | null, unread, issuedAt }`.
L'app vérifie `sig` avec la clé publique embarquée et, hors ligne, accepte le dernier statut jusqu'à `graceUntil`.

## Développement

```bash
npm ci
npm test                     # D1 et Durable Object simulés (migrations appliquées automatiquement)
npm run check                # build sans déployer
```

## Mise en production (pas encore faite)

```bash
wrangler d1 create ultratv-reseller            # puis reporter database_id dans wrangler.toml
wrangler d1 migrations apply ultratv-reseller --remote
# Paire de clés Ed25519 : la privée en secret, la publique dans l'app revendeur
node -e 'const {generateKeyPairSync}=require("node:crypto");const k=generateKeyPairSync("ed25519");console.log(k.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"));console.log(k.publicKey.export({format:"der",type:"spki"}).toString("base64"))'
wrangler secret put LICENSE_SIGNING_KEY
wrangler deploy
```

La clé de `vitest.config.js` est une clé de **test** uniquement.
