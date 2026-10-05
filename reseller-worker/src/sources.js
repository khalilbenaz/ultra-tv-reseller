// Abonnement IPTV configuré par le revendeur pour un client (saisie du code affiché sur l'écran du client).
// Les identifiants sont chiffrés au repos (AES-256-GCM, clé PROVIDER_ENC_KEY, AAD = client) ; ils ne sont renvoyés
// en clair qu'aux appareils de ce client, et seulement tant que sa licence (ou son essai) est valide.

import { decryptJson, encryptJson, keysFromEnv } from "./lib/crypto.js";
import { sanitizeText } from "./lib/sanitize.js";
import { normalizeDeviceCode } from "./license.js";
import { PanelError } from "./panel.js";

const text = (v, max) => sanitizeText(typeof v === "string" ? v : "", max).trim();
const aad = (customerId) => `customer-source:${customerId}`;

/** Adresse http(s) sans espaces ni identifiants intégrés ; renvoie l'URL normalisée ou lève. */
function checkUrl(raw, { m3u = false } = {}) {
  const s = text(raw, 2000);
  let u;
  try { u = new URL(s); } catch { throw new PanelError(m3u ? "invalid_m3u" : "invalid_server"); }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname || /\s/.test(s)) throw new PanelError(m3u ? "invalid_m3u" : "invalid_server");
  if (!m3u && (u.username || u.password)) throw new PanelError("invalid_server");
  return m3u ? s : `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
}

/** Valide et normalise la saisie du panneau. `previous` : ancien secret (mot de passe laissé vide = inchangé). */
export function parseSourceForm(form, previous = null) {
  const kind = form.kind === "m3u" ? "m3u" : "xtream";
  const name = text(form.name, 60) || "IPTV";
  if (kind === "m3u") {
    const url = form.url ? checkUrl(form.url, { m3u: true }) : previous?.kind === "m3u" ? previous.url : null;
    if (!url) throw new PanelError("invalid_m3u");
    return { kind, name, url };
  }
  const server = checkUrl(form.server);
  const username = text(form.username, 128);
  const password = typeof form.password === "string" && form.password !== "" ? form.password.slice(0, 128) : previous?.kind === "xtream" ? previous.password : "";
  if (!username || !password) throw new PanelError("missing_credentials");
  return { kind, name, server, username, password };
}

/** Client (du revendeur) d'un code appareil ; l'appareil doit être activé. */
export async function customerOfCode(db, rid, code) {
  const c = normalizeDeviceCode(code);
  if (!c) throw new PanelError("invalid_code");
  const d = await db.prepare(`SELECT d.customer_id FROM device d JOIN customer cu ON cu.id = d.customer_id WHERE d.code = ? AND cu.reseller_id = ?`).bind(c, rid).first();
  if (d?.customer_id) return d.customer_id;
  const exists = await db.prepare(`SELECT customer_id FROM device WHERE code = ?`).bind(c).first();
  if (!exists) throw new PanelError("unknown_code");
  throw new PanelError(exists.customer_id ? "unknown_customer" : "activate_first");
}

async function ownCustomer(db, rid, cid) {
  const c = await db.prepare(`SELECT id FROM customer WHERE id = ? AND reseller_id = ?`).bind(cid, rid).first();
  if (!c) throw new PanelError("unknown_customer");
}

/** Abonnement actuel d'un client, déchiffré (pour le panneau : le mot de passe n'y est jamais réaffiché). */
export async function getCustomerSource(env, cid) {
  const row = await env.RESELLER.prepare(`SELECT * FROM customer_source WHERE customer_id = ?`).bind(cid).first();
  if (!row) return null;
  const secret = await decryptJson(keysFromEnv(env), row.enc, aad(cid));
  return { kind: row.kind, name: row.name, updatedAt: row.updated_at, ...secret };
}

/** Crée ou remplace l'abonnement IPTV du client (un par client). */
export async function setCustomerSource(env, rid, cid, form, actor, now = Date.now()) {
  await ownCustomer(env.RESELLER, rid, cid);
  const previous = await getCustomerSource(env, cid).catch(() => null);
  const s = parseSourceForm(form, previous);
  const secret = s.kind === "m3u" ? { url: s.url } : { server: s.server, username: s.username, password: s.password };
  const enc = await encryptJson(keysFromEnv(env), secret, aad(cid));
  await env.RESELLER.prepare(
    `INSERT INTO customer_source (customer_id, kind, name, enc, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (customer_id) DO UPDATE SET kind = excluded.kind, name = excluded.name, enc = excluded.enc, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(cid, s.kind, s.name, enc, now, actor).run();
}

export async function removeCustomerSource(env, rid, cid) {
  await ownCustomer(env.RESELLER, rid, cid);
  await env.RESELLER.prepare(`DELETE FROM customer_source WHERE customer_id = ?`).bind(cid).run();
}

/** Pour l'appareil : abonnement de son client si la licence le permet (sinon liste vide → l'app retire la source). */
export async function sourcesForDevice(env, ctx, allowed) {
  if (!allowed || !ctx.customer) return [];
  const s = await getCustomerSource(env, ctx.customer.id);
  if (!s) return [];
  return [{ id: `cs-${ctx.customer.id}`, ...s }];
}
