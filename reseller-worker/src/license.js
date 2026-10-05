// Licences d'utilisation de l'application (programme revendeur, variante « revendeur » de l'app).
// Aucun contenu ici : un appareil, un code court, un essai, une licence 1 an / 2 appareils vendue par un revendeur.
// Stockage D1 (binding RESELLER) : il faut des requêtes et des transactions (débit de crédit atomique).
// Le statut renvoyé à l'app est SIGNÉ (Ed25519) pour pouvoir être vérifié hors ligne.

import { b64uEncode, randomToken, sha256Hex } from "./lib/crypto.js";
import { sanitizeText } from "./lib/sanitize.js";

export const TRIAL_MS = 7 * 24 * 3600_000;
export const GRACE_MS = 3 * 24 * 3600_000;
const SEEN_EVERY_MS = 3600_000; // « vu » mis à jour au plus une fois par heure (écritures D1 limitées)

// Sans 0/O, 1/I/L, U/V : lisible à voix haute et sur un écran de TV.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";

/** Code appareil court, ex. « 7F3K-92QD » (8 caractères, ~39 bits). Tirage sans biais. */
export function newDeviceCode() {
  const out = [];
  const max = 256 - (256 % ALPHABET.length);
  while (out.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < max && out.length < 8) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return `${out.slice(0, 4).join("")}-${out.slice(4).join("")}`;
}

/** Saisie libre (minuscules, espaces, sans tiret) → forme canonique, ou null. */
export function normalizeDeviceCode(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/**
 * Statut d'un appareil (fonction pure).
 * Priorité : licence suspendue > licence valide > licence expirée > essai > expiré.
 * La suspension d'un REVENDEUR (ou de son distributeur) ne touche jamais ses clients : ils ont payé leur période,
 * leur licence reste valide jusqu'à son expiration. Seule la suspension explicite d'un client le bloque.
 */
export function computeStatus({ device, license }, now = Date.now()) {
  if (license) {
    if (license.status !== "active") return { status: "suspended", until: null };
    if (license.expires_at > now) return { status: "active", until: license.expires_at };
    return { status: "expired", until: license.expires_at };
  }
  if (device.trial_ends_at > now) return { status: "trial", until: device.trial_ends_at };
  return { status: "expired", until: device.trial_ends_at };
}

/** Premier lancement de l'app : crée l'appareil et démarre l'essai. Le secret n'est renvoyé qu'ici (seul son hachage est gardé). */
export async function registerDevice(db, info, now = Date.now()) {
  const id = crypto.randomUUID();
  const secret = randomToken(32);
  const hash = await sha256Hex(secret);
  const platform = sanitizeText(String(info.platform ?? ""), 24) || null;
  const model = sanitizeText(String(info.model ?? ""), 64) || null;
  const appVersion = sanitizeText(String(info.appVersion ?? ""), 24) || null;
  for (let i = 0; i < 5; i++) {
    const code = newDeviceCode();
    try {
      await db.prepare(
        `INSERT INTO device (id, code, install_secret_hash, platform, model, app_version, trial_ends_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, code, hash, platform, model, appVersion, now + TRIAL_MS, now, now).run();
      return { deviceId: id, code, installSecret: secret, trialEndsAt: now + TRIAL_MS };
    } catch (e) {
      if (!/UNIQUE/i.test(String(e?.message))) throw e; // collision de code : nouveau tirage
    }
  }
  throw new Error("code_space_exhausted");
}

/** Appareil + licence courante + revendeur, à partir du secret d'installation. null si inconnu. */
export async function loadDeviceContext(db, installSecret) {
  if (typeof installSecret !== "string" || installSecret.length < 20 || installSecret.length > 128) return null;
  const device = await db.prepare(`SELECT * FROM device WHERE install_secret_hash = ?`).bind(await sha256Hex(installSecret)).first();
  if (!device) return null;
  if (!device.customer_id) return { device, license: null, reseller: null, customer: null };
  const row = await db.prepare(
    `SELECT c.id AS c_id, c.reseller_id, r.id AS r_id, r.name, r.status AS r_status, r.support_whatsapp, r.support_telegram, r.support_text,
            r.parent_id, p.status AS p_status
       FROM customer c JOIN reseller r ON r.id = c.reseller_id LEFT JOIN reseller p ON p.id = r.parent_id WHERE c.id = ?`,
  ).bind(device.customer_id).first();
  // Licence la plus lointaine du client (un renouvellement prolonge, il n'y en a normalement qu'une).
  const license = await db.prepare(`SELECT * FROM license WHERE customer_id = ? ORDER BY expires_at DESC LIMIT 1`).bind(device.customer_id).first();
  // Statut du revendeur pour information (panneau, activations) ; sans effet sur la licence des clients.
  const reseller = row ? {
    id: row.r_id, name: row.name, parentId: row.parent_id ?? null,
    status: row.r_status === "active" && (!row.parent_id || row.p_status === "active") ? "active" : "suspended",
    support_whatsapp: row.support_whatsapp, support_telegram: row.support_telegram, support_text: row.support_text,
  } : null;
  return { device, license: license ?? null, reseller, customer: row ? { id: row.c_id } : null };
}

/**
 * Annonces visibles par un appareil : celles de son revendeur (à tous ou à son client) et celles que le distributeur
 * du revendeur adresse à tout son réseau. Paramètres : ?1 revendeur, ?2 « customer:<id> », ?3 maintenant, ?5 distributeur.
 */
export const VISIBLE_MESSAGES = `((m.reseller_id = ?1 AND (m.target = 'all' OR m.target = ?2)) OR (?5 IS NOT NULL AND m.reseller_id = ?5 AND m.target = 'network'))
        AND (m.expires_at IS NULL OR m.expires_at > ?3)`;
export const visibleBinds = (ctx, now) => [ctx.reseller.id, `customer:${ctx.customer.id}`, now, ctx.device.id, ctx.reseller.parentId ?? null];

/** Annonces non lues destinées à l'appareil (toutes celles du revendeur + celles adressées à son client). */
export async function unreadCount(db, ctx, now = Date.now()) {
  if (!ctx.reseller || !ctx.customer) return 0;
  const r = await db.prepare(
    `SELECT COUNT(*) AS n FROM message m
      WHERE ${VISIBLE_MESSAGES}
        AND NOT EXISTS (SELECT 1 FROM message_read x WHERE x.message_id = m.id AND x.device_id = ?4)`,
  ).bind(...visibleBinds(ctx, now)).first();
  return r?.n ?? 0;
}

/** Charge utile du statut (ce que l'app affiche et vérifie hors ligne). */
export function statusPayload(ctx, unread, now = Date.now()) {
  const { status, until } = computeStatus(ctx, now);
  const r = ctx.reseller;
  return {
    v: 1,
    deviceId: ctx.device.id,
    code: ctx.device.code,
    status,
    until,
    // Hors ligne, l'app accepte le dernier statut signé jusqu'à cette date.
    graceUntil: (status === "active" || status === "trial") && until ? until + GRACE_MS : null,
    reseller: r ? { name: r.name, whatsapp: r.support_whatsapp || null, telegram: r.support_telegram || null, text: r.support_text || null } : null,
    unread,
    issuedAt: now,
  };
}

let keyCache = null;
async function signingKey(env) {
  const raw = env.LICENSE_SIGNING_KEY;
  if (!raw) return null;
  if (keyCache?.raw === raw) return keyCache.key;
  const der = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
  keyCache = { raw, key };
  return key;
}

/** { payload, sig } : payload = JSON en base64url, sig = Ed25519(payload) en base64url. null si la clé n'est pas configurée. */
export async function signPayload(env, payload) {
  const key = await signingKey(env);
  if (!key) return null;
  const p = b64uEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(p));
  return { payload: p, sig: b64uEncode(sig) };
}

/** Met à jour « vu » et la version de l'app, au plus une fois par heure. */
export async function touchDevice(db, device, appVersion, now = Date.now()) {
  if (device.last_seen_at && now - device.last_seen_at < SEEN_EVERY_MS) return;
  const v = sanitizeText(String(appVersion ?? ""), 24) || device.app_version;
  await db.prepare(`UPDATE device SET last_seen_at = ?, app_version = ? WHERE id = ?`).bind(now, v, device.id).run();
}
