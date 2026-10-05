// Logique du panneau revendeur (sans HTML) : crédits, activations, clients, annonces, administration.
// Règle d'or : un crédit n'est JAMAIS débité deux fois ni en négatif. Chaque opération payante est un lot D1
// (transaction) dont la première instruction insère la ligne du grand livre SOUS CONDITION (solde suffisant,
// appareil libre, revendeur actif et contrat accepté) ; les instructions suivantes n'agissent que si cette
// ligne existe (`EXISTS ... ref = ?`). Deux activations simultanées du même code : une seule passe.

import { normalizeDeviceCode, renewalReminder, VISIBLE_MESSAGES, visibleBinds } from "./license.js";
import { sanitizeText } from "./lib/sanitize.js";

export const YEAR_MS = 365 * 24 * 3600_000;
/** Plafond absolu d'appareils par licence (le plafond d'un revendeur est fixé entre 1 et cette valeur). */
export const MAX_DEVICES_HARD = 10;
/** Délais de rappel de renouvellement proposés (jours avant l'expiration ; 0 = pas de rappel). */
export const REMINDER_CHOICES = [0, 7, 15, 30];
export const AGREEMENT_VERSION = "2026-10-05";
const BAL = `(SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE reseller_id = ?)`;

export class PanelError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const text = (v, max) => sanitizeText(typeof v === "string" ? v : "", max).trim();
const uuid = () => crypto.randomUUID();

export async function balance(db, rid) {
  return (await db.prepare(`SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE reseller_id = ?`).bind(rid).first())?.n ?? 0;
}

export async function getReseller(db, rid) {
  return db.prepare(`SELECT * FROM reseller WHERE id = ?`).bind(rid).first();
}

export async function resellerByLogin(db, login) {
  return db.prepare(`SELECT * FROM reseller WHERE login = ?`).bind(String(login ?? "").trim().toLowerCase()).first();
}

/** Raison précise d'un refus d'opération payante (après coup, pour un message clair). */
async function whyRefused(db, rid, deviceId) {
  const r = await getReseller(db, rid);
  if (!r || r.status !== "active") throw new PanelError("reseller_suspended");
  if (r.parent_id && (await getReseller(db, r.parent_id))?.status !== "active") throw new PanelError("reseller_suspended");
  if (!r.agreement_signed_at) throw new PanelError("agreement_required");
  if (deviceId) {
    const d = await db.prepare(`SELECT customer_id FROM device WHERE id = ?`).bind(deviceId).first();
    if (d?.customer_id) throw new PanelError("already_active");
  }
  if ((await balance(db, rid)) < 1) throw new PanelError("no_credit");
  throw new PanelError("conflict");
}

async function deviceByCode(db, raw) {
  const code = normalizeDeviceCode(raw);
  if (!code) throw new PanelError("invalid_code");
  const d = await db.prepare(`SELECT * FROM device WHERE code = ?`).bind(code).first();
  if (!d) throw new PanelError("unknown_code");
  return d;
}

async function ownCustomer(db, rid, cid) {
  const c = await db.prepare(`SELECT * FROM customer WHERE id = ? AND reseller_id = ?`).bind(cid, rid).first();
  if (!c) throw new PanelError("unknown_customer");
  return c;
}

/** Plafond d'appareils par licence d'un revendeur : le sien, borné par celui de son distributeur. */
export async function deviceCap(db, rid) {
  const r = await getReseller(db, rid);
  let cap = Math.min(MAX_DEVICES_HARD, Math.max(1, r?.max_devices_cap ?? 5));
  if (r?.parent_id) cap = Math.min(cap, Math.max(1, (await getReseller(db, r.parent_id))?.max_devices_cap ?? 5));
  return cap;
}

const intIn = (v, lo, hi) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

async function currentLicense(db, cid) {
  return db.prepare(`SELECT * FROM license WHERE customer_id = ? ORDER BY expires_at DESC LIMIT 1`).bind(cid).first();
}

/**
 * Active un code appareil.
 * - sans `customerId` : nouveau client, 1 crédit, licence 1 an / 2 appareils ;
 * - avec `customerId` : appareil supplémentaire d'un client existant, sans crédit, dans la limite de sa licence.
 */
export async function activate(db, rid, { code, customerId = null, label = "", devices = null }, actor, now = Date.now()) {
  const device = await deviceByCode(db, code);
  if (device.customer_id) throw new PanelError("already_active");

  if (customerId) {
    await ownCustomer(db, rid, customerId);
    const lic = await currentLicense(db, customerId);
    if (!lic || lic.status !== "active" || lic.expires_at <= now) throw new PanelError("license_inactive");
    const r = await db.prepare(
      `UPDATE device SET customer_id = ?1 WHERE id = ?2 AND customer_id IS NULL
         AND (SELECT COUNT(*) FROM device WHERE customer_id = ?1) < ?3`,
    ).bind(customerId, device.id, lic.max_devices).run();
    if (r.meta.changes !== 1) {
      const n = (await db.prepare(`SELECT COUNT(*) AS n FROM device WHERE customer_id = ?`).bind(customerId).first()).n;
      throw new PanelError(n >= lic.max_devices ? "device_limit" : "already_active");
    }
    return { customerId, licenseId: lic.id, credited: 0 };
  }

  const cid = uuid(), lid = uuid();
  const lbl = text(label, 80) || null;
  // Nombre d'appareils de la licence : choisi par le revendeur, dans son plafond.
  const cap = await deviceCap(db, rid);
  // Non précisé (activation en lot, ancien formulaire) : 2 appareils, ou moins si le plafond est plus bas.
  const maxDevices = devices == null || devices === "" ? Math.min(2, cap) : intIn(devices, 1, cap);
  if (maxDevices === null) throw new PanelError("device_cap");
  const res = await db.batch([
    db.prepare(
      `INSERT INTO credit_ledger (reseller_id, delta, reason, ref, note, created_at, created_by)
       SELECT ?1, -1, 'activation', ?2, ?3, ?4, ?5
        WHERE ${BAL.replace("?", "?1")} >= 1
          AND EXISTS (SELECT 1 FROM device WHERE id = ?6 AND customer_id IS NULL)
          AND EXISTS (SELECT 1 FROM reseller r0 WHERE r0.id = ?1 AND r0.status = 'active' AND r0.agreement_signed_at IS NOT NULL AND (r0.parent_id IS NULL OR EXISTS (SELECT 1 FROM reseller p0 WHERE p0.id = r0.parent_id AND p0.status = 'active')))`,
    ).bind(rid, lid, device.code, now, actor, device.id),
    db.prepare(`INSERT INTO customer (id, reseller_id, label, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM credit_ledger WHERE ref = ?)`)
      .bind(cid, rid, lbl, now, lid),
    db.prepare(`INSERT INTO license (id, customer_id, starts_at, expires_at, max_devices) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM credit_ledger WHERE ref = ?)`)
      .bind(lid, cid, now, now + YEAR_MS, maxDevices, lid),
    db.prepare(`UPDATE device SET customer_id = ? WHERE id = ? AND customer_id IS NULL AND EXISTS (SELECT 1 FROM credit_ledger WHERE ref = ?)`)
      .bind(cid, device.id, lid),
  ]);
  if (res[0].meta.changes !== 1) await whyRefused(db, rid, device.id);
  return { customerId: cid, licenseId: lid, credited: 1 };
}

/** Renouvelle 1 an à partir de la fin actuelle (ou d'aujourd'hui si expirée) : 1 crédit. */
export async function renew(db, rid, customerId, actor, now = Date.now()) {
  await ownCustomer(db, rid, customerId);
  const lic = await currentLicense(db, customerId);
  if (!lic || lic.status === "revoked") throw new PanelError("license_inactive");
  const ref = `renew:${uuid()}`;
  const res = await db.batch([
    db.prepare(
      `INSERT INTO credit_ledger (reseller_id, delta, reason, ref, note, created_at, created_by)
       SELECT ?1, -1, 'renewal', ?2, ?3, ?4, ?5
        WHERE ${BAL.replace("?", "?1")} >= 1
          AND EXISTS (SELECT 1 FROM reseller r0 WHERE r0.id = ?1 AND r0.status = 'active' AND r0.agreement_signed_at IS NOT NULL AND (r0.parent_id IS NULL OR EXISTS (SELECT 1 FROM reseller p0 WHERE p0.id = r0.parent_id AND p0.status = 'active')))`,
    ).bind(rid, ref, lic.id, now, actor),
    db.prepare(`UPDATE license SET expires_at = MAX(expires_at, ?) + ? WHERE id = ? AND EXISTS (SELECT 1 FROM credit_ledger WHERE ref = ?)`)
      .bind(now, YEAR_MS, lic.id, ref),
  ]);
  if (res[0].meta.changes !== 1) await whyRefused(db, rid, null);
  return { expiresAt: Math.max(lic.expires_at, now) + YEAR_MS };
}

/**
 * Change le nombre d'appareils autorisés de la licence d'un client : entre 1 et le plafond du revendeur, et jamais
 * sous le nombre d'appareils déjà rattachés (détacher d'abord). Sans effet sur les crédits.
 */
export async function setLicenseDevices(db, rid, customerId, n) {
  await ownCustomer(db, rid, customerId);
  const lic = await currentLicense(db, customerId);
  if (!lic || lic.status === "revoked") throw new PanelError("license_inactive");
  const max = intIn(n, 1, await deviceCap(db, rid));
  if (max === null) throw new PanelError("device_cap");
  const r = await db.prepare(`UPDATE license SET max_devices = ?1 WHERE id = ?2 AND (SELECT COUNT(*) FROM device WHERE customer_id = ?3) <= ?1`)
    .bind(max, lic.id, customerId).run();
  if (r.meta.changes !== 1) throw new PanelError("devices_in_use");
  return max;
}

/** Plafond d'appareils par licence d'un revendeur (administrateur). */
export async function setDeviceCap(db, rid, cap) {
  const c = intIn(cap, 1, MAX_DEVICES_HARD);
  if (c === null) throw new PanelError("device_cap");
  await db.prepare(`UPDATE reseller SET max_devices_cap = ? WHERE id = ? AND role = 'reseller'`).bind(c, rid).run();
}

/** Plafond d'un sous-revendeur, fixé par son distributeur dans la limite du sien. */
export async function setSubDeviceCap(db, did, sid, cap) {
  await getSub(db, did, sid);
  const c = intIn(cap, 1, await deviceCap(db, did));
  if (c === null) throw new PanelError("device_cap");
  await db.prepare(`UPDATE reseller SET max_devices_cap = ? WHERE id = ?`).bind(c, sid).run();
}

/** Suspend / réactive la licence d'un client (ses appareils passent « suspendu »). Sans effet sur les crédits. */
export async function setCustomerSuspended(db, rid, customerId, suspended) {
  await ownCustomer(db, rid, customerId);
  await db.prepare(`UPDATE license SET status = ? WHERE customer_id = ? AND status != 'revoked'`)
    .bind(suspended ? "suspended" : "active", customerId).run();
}

/** Détache un appareil (changement de box) : la place se libère pour un autre code. */
export async function detachDevice(db, rid, deviceId) {
  const r = await db.prepare(`UPDATE device SET customer_id = NULL WHERE id = ? AND customer_id IN (SELECT id FROM customer WHERE reseller_id = ?)`)
    .bind(deviceId, rid).run();
  if (r.meta.changes !== 1) throw new PanelError("unknown_device");
}

export async function setCustomerLabel(db, rid, customerId, label, note) {
  await ownCustomer(db, rid, customerId);
  await db.prepare(`UPDATE customer SET label = ?, note = ? WHERE id = ?`).bind(text(label, 80) || null, text(note, 500) || null, customerId).run();
}

export async function dashboardStats(db, rid, now = Date.now()) {
  const month = new Date(now); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const [bal, acts, exp, cust] = await Promise.all([
    balance(db, rid),
    db.prepare(`SELECT COUNT(*) AS n FROM credit_ledger WHERE reseller_id = ? AND reason IN ('activation', 'renewal') AND created_at >= ?`).bind(rid, month.getTime()).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM license l JOIN customer c ON c.id = l.customer_id WHERE c.reseller_id = ? AND l.status = 'active' AND l.expires_at BETWEEN ? AND ?`)
      .bind(rid, now, now + 30 * 24 * 3600_000).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM customer WHERE reseller_id = ?`).bind(rid).first(),
  ]);
  return { balance: bal, monthOps: acts.n, expiringSoon: exp.n, customers: cust.n };
}

/** Clients (avec licence courante et nombre d'appareils), recherche sur le libellé ou un code appareil. */
export async function listCustomers(db, rid, q = "") {
  const like = `%${text(q, 40).replace(/[%_]/g, "")}%`;
  const { results } = await db.prepare(
    `SELECT c.id, c.label, c.created_at,
            (SELECT MAX(expires_at) FROM license WHERE customer_id = c.id) AS expires_at,
            (SELECT status FROM license WHERE customer_id = c.id ORDER BY expires_at DESC LIMIT 1) AS lic_status,
            (SELECT COUNT(*) FROM device WHERE customer_id = c.id) AS devices,
            (SELECT max_devices FROM license WHERE customer_id = c.id ORDER BY expires_at DESC LIMIT 1) AS max_devices
       FROM customer c
      WHERE c.reseller_id = ?1
        AND (?2 = '%%' OR c.label LIKE ?2 OR EXISTS (SELECT 1 FROM device d WHERE d.customer_id = c.id AND d.code LIKE ?2))
      ORDER BY expires_at ASC LIMIT 500`,
  ).bind(rid, like).all();
  return results;
}

export async function customerDetail(db, rid, customerId) {
  const c = await ownCustomer(db, rid, customerId);
  const lic = await currentLicense(db, customerId);
  const { results: devices } = await db.prepare(
    `SELECT id, code, platform, model, app_version, last_seen_at, created_at FROM device WHERE customer_id = ? ORDER BY created_at`,
  ).bind(customerId).all();
  return { customer: c, license: lic, devices };
}

// ---- annonces ----

export async function createMessage(db, rid, { target, title, body, days }, now = Date.now()) {
  const t = text(title, 120), b = text(body, 2000);
  if (!t || !b) throw new PanelError("message_empty");
  let tgt = "all";
  if (target === "network") {
    const d = await getReseller(db, rid);
    if (d?.is_distributor !== 1) throw new PanelError("not_distributor");
    tgt = "network";
  } else if (target && target !== "all") { await ownCustomer(db, rid, target); tgt = `customer:${target}`; }
  const d = Number(days);
  const exp = Number.isFinite(d) && d > 0 ? now + Math.min(d, 365) * 24 * 3600_000 : null;
  const id = uuid();
  await db.prepare(`INSERT INTO message (id, reseller_id, target, title, body, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, rid, tgt, t, b, now, exp).run();
  return id;
}

export async function listMessages(db, rid) {
  const { results } = await db.prepare(
    `SELECT m.*, (SELECT COUNT(*) FROM message_read r WHERE r.message_id = m.id) AS reads,
            (SELECT label FROM customer WHERE 'customer:' || id = m.target) AS target_label
       FROM message m WHERE m.reseller_id = ? ORDER BY m.created_at DESC LIMIT 200`,
  ).bind(rid).all();
  return results;
}

export async function deleteMessage(db, rid, id) {
  await db.batch([
    db.prepare(`DELETE FROM message_read WHERE message_id IN (SELECT id FROM message WHERE id = ? AND reseller_id = ?)`).bind(id, rid),
    db.prepare(`DELETE FROM message WHERE id = ? AND reseller_id = ?`).bind(id, rid),
  ]);
}

/** Boîte de réception d'un appareil (contexte de licence.js). */
export async function inboxFor(db, ctx, now = Date.now()) {
  if (!ctx.reseller || !ctx.customer) return [];
  const { results } = await db.prepare(
    `SELECT m.id, m.title, m.body, m.created_at AS at,
            EXISTS (SELECT 1 FROM message_read x WHERE x.message_id = m.id AND x.device_id = ?4) AS read
       FROM message m
      WHERE ${VISIBLE_MESSAGES}
      ORDER BY m.created_at DESC LIMIT 50`,
  ).bind(...visibleBinds(ctx, now)).all();
  const list = results.map((m) => ({ ...m, kind: "message", read: !!m.read }));
  // Rappel de renouvellement automatique (réglé par le revendeur), en tête : texte traduit par l'app grâce à `kind`.
  const rem = renewalReminder(ctx, now);
  if (rem) {
    const read = await db.prepare(`SELECT 1 AS x FROM message_read WHERE message_id = ? AND device_id = ?`).bind(rem.id, ctx.device.id).first();
    list.unshift({ ...rem, read: !!read });
  }
  return list;
}

export async function markRead(db, ctx, ids, now = Date.now()) {
  const list = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && x.length <= 64).slice(0, 50);
  if (!list.length || !ctx.reseller) return 0;
  // Seulement des annonces que l'appareil a le droit de voir.
  const visible = new Set((await inboxFor(db, ctx, now)).map((m) => m.id));
  const ok = list.filter((id) => visible.has(id));
  if (ok.length) await db.batch(ok.map((id) => db.prepare(`INSERT OR IGNORE INTO message_read (message_id, device_id, read_at) VALUES (?, ?, ?)`).bind(id, ctx.device.id, now)));
  return ok.length;
}

// ---- profil et contrat ----

export async function updateProfile(db, rid, { name, whatsapp, telegram, supportText, reminderDays }) {
  const n = text(name, 60);
  if (!n) throw new PanelError("name_required");
  const wa = text(whatsapp, 32).replace(/[^\d+]/g, "") || null;
  const tg = text(telegram, 64).replace(/^@/, "").replace(/[^\w]/g, "") || null;
  const rd = REMINDER_CHOICES.includes(Number(reminderDays)) ? Number(reminderDays) : 15;
  await db.prepare(`UPDATE reseller SET name = ?, support_whatsapp = ?, support_telegram = ?, support_text = ?, reminder_days = ? WHERE id = ?`)
    .bind(n, wa, tg, text(supportText, 300) || null, rd, rid).run();
}

export async function acceptAgreement(db, rid, now = Date.now()) {
  await db.prepare(`UPDATE reseller SET agreement_signed_at = ?, agreement_version = ? WHERE id = ?`).bind(now, AGREEMENT_VERSION, rid).run();
}

// ---- administration ----

export async function createReseller(db, { login, name, passwordHash, role = "reseller", parentId = null, isDistributor = false }, now = Date.now()) {
  const l = String(login ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(l)) throw new PanelError("invalid_login");
  const n = text(name, 60);
  if (!n) throw new PanelError("name_required");
  const id = uuid();
  try {
    await db.prepare(`INSERT INTO reseller (id, login, name, role, password_hash, must_change_password, created_at, parent_id, is_distributor) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`)
      .bind(id, l, n, role, passwordHash, now, parentId, isDistributor ? 1 : 0).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) throw new PanelError("login_taken");
    throw e;
  }
  return id;
}

export async function listResellers(db) {
  const { results } = await db.prepare(
    `SELECT r.id, r.login, r.name, r.status, r.role, r.agreement_signed_at, r.created_at, r.is_distributor, r.parent_id,
            (SELECT name FROM reseller WHERE id = r.parent_id) AS parent_name,
            (SELECT COUNT(*) FROM reseller WHERE parent_id = r.id) AS subs,
            (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE reseller_id = r.id) AS balance,
            (SELECT COUNT(*) FROM customer WHERE reseller_id = r.id) AS customers
       FROM reseller r ORDER BY r.created_at`,
  ).all();
  return results;
}

/** Crédits ajoutés (achat payé) ou corrigés par l'administrateur ; jamais de solde négatif. */
export async function addCredits(db, rid, amount, note, actor, now = Date.now()) {
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 100_000) throw new PanelError("invalid_amount");
  const r = await db.prepare(
    `INSERT INTO credit_ledger (reseller_id, delta, reason, note, created_at, created_by)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM reseller WHERE id = ?1) AND ${BAL.replace("?", "?1")} + ?2 >= 0`,
  ).bind(rid, n, n > 0 ? "purchase" : "adjust", text(note, 200) || null, now, actor).run();
  if (r.meta.changes !== 1) throw new PanelError(n < 0 ? "no_credit" : "unknown_reseller");
}

export async function setResellerStatus(db, rid, status) {
  if (status !== "active" && status !== "suspended") throw new PanelError("invalid_status");
  await db.prepare(`UPDATE reseller SET status = ?, session_epoch = session_epoch + (? = 'suspended') WHERE id = ? AND role = 'reseller'`)
    .bind(status, status, rid).run();
}

export async function ledger(db, rid, limit = 200) {
  const { results } = await db.prepare(`SELECT * FROM credit_ledger WHERE reseller_id = ? ORDER BY id DESC LIMIT ?`).bind(rid, limit).all();
  return results;
}

export async function setPassword(db, rid, passwordHash, { mustChange = false } = {}) {
  await db.prepare(`UPDATE reseller SET password_hash = ?, must_change_password = ?, session_epoch = session_epoch + 1 WHERE id = ?`)
    .bind(passwordHash, mustChange ? 1 : 0, rid).run();
}

// ---- Phase 2 : réseau de distribution ----
// Deux niveaux : un distributeur (is_distributor = 1, sans parent) crée des sous-revendeurs (parent_id = distributeur).
// Les crédits passent du distributeur au sous-revendeur par transfert (deux lignes du grand livre, même référence,
// dans un seul lot : jamais de crédit créé ni perdu, jamais de solde négatif).

/** Le revendeur est-il un distributeur actif pouvant gérer un réseau ? */
async function distributor(db, did) {
  const d = await getReseller(db, did);
  if (!d || d.is_distributor !== 1 || d.parent_id) throw new PanelError("not_distributor");
  if (d.status !== "active") throw new PanelError("reseller_suspended");
  return d;
}

/** Sous-revendeur appartenant à ce distributeur. */
export async function getSub(db, did, sid) {
  const r = await db.prepare(`SELECT * FROM reseller WHERE id = ? AND parent_id = ? AND role = 'reseller'`).bind(sid, did).first();
  if (!r) throw new PanelError("unknown_reseller");
  return r;
}

export async function createSubReseller(db, did, { login, name, passwordHash }, now = Date.now()) {
  await distributor(db, did);
  return createReseller(db, { login, name, passwordHash, parentId: did }, now);
}

/** Sous-revendeurs avec solde, clients, opérations des 30 derniers jours et dernière activité. */
export async function listSubResellers(db, did, now = Date.now()) {
  const { results } = await db.prepare(
    `SELECT r.id, r.login, r.name, r.status, r.agreement_signed_at, r.created_at,
            (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE reseller_id = r.id) AS balance,
            (SELECT COUNT(*) FROM customer WHERE reseller_id = r.id) AS customers,
            (SELECT COUNT(*) FROM credit_ledger WHERE reseller_id = r.id AND reason IN ('activation', 'renewal') AND created_at >= ?2) AS ops30,
            (SELECT MAX(created_at) FROM credit_ledger WHERE reseller_id = r.id AND reason IN ('activation', 'renewal')) AS last_op
       FROM reseller r WHERE r.parent_id = ?1 ORDER BY r.created_at`,
  ).bind(did, now - 30 * 24 * 3600_000).all();
  return results;
}

/** Totaux du réseau (distributeur + sous-revendeurs). */
export async function networkStats(db, did, now = Date.now()) {
  const subs = await listSubResellers(db, did, now);
  const own = await dashboardStats(db, did, now);
  return {
    subs: subs.length,
    activeSubs: subs.filter((x) => x.status === "active").length,
    subCredits: subs.reduce((a, x) => a + x.balance, 0),
    networkCustomers: own.customers + subs.reduce((a, x) => a + x.customers, 0),
    networkOps30: subs.reduce((a, x) => a + x.ops30, 0),
  };
}

async function moveCredits(db, fromId, toId, n, ref, actor, now) {
  const res = await db.batch([
    db.prepare(
      `INSERT INTO credit_ledger (reseller_id, delta, reason, ref, note, created_at, created_by)
       SELECT ?1, -?2, 'transfer', ?3, ?4, ?5, ?6 WHERE ${BAL.replace("?", "?1")} >= ?2`,
    ).bind(fromId, n, ref, `to ${toId}`, now, actor),
    db.prepare(
      `INSERT INTO credit_ledger (reseller_id, delta, reason, ref, note, created_at, created_by)
       SELECT ?1, ?2, 'transfer', ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM credit_ledger WHERE ref = ?3 AND reseller_id = ?7)`,
    ).bind(toId, n, ref, `from ${fromId}`, now, actor, fromId),
  ]);
  if (res[0].meta.changes !== 1) throw new PanelError("no_credit");
}

const amountOf = (amount) => {
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n < 1 || n > 100_000) throw new PanelError("invalid_amount");
  return n;
};

/** Transfert de N crédits du distributeur vers un de ses sous-revendeurs. */
export async function transferCredits(db, did, sid, amount, actor, now = Date.now()) {
  const n = amountOf(amount);
  await distributor(db, did);
  await getSub(db, did, sid);
  await moveCredits(db, did, sid, n, `transfer:${uuid()}`, actor, now);
}

/** Reprise de N crédits inutilisés d'un sous-revendeur vers son distributeur. */
export async function reclaimCredits(db, did, sid, amount, actor, now = Date.now()) {
  const n = amountOf(amount);
  await distributor(db, did);
  await getSub(db, did, sid);
  await moveCredits(db, sid, did, n, `reclaim:${uuid()}`, actor, now);
}

/** Suspendre / réactiver un sous-revendeur (ses sessions sont coupées, ses clients suspendus). */
export async function setSubStatus(db, did, sid, status) {
  await distributor(db, did);
  await getSub(db, did, sid);
  await setResellerStatus(db, sid, status);
}

/** Administration : faire (ou défaire) d'un revendeur sans parent un distributeur. */
export async function setDistributor(db, rid, on) {
  const r = await getReseller(db, rid);
  if (!r || r.role !== "reseller" || r.parent_id) throw new PanelError("unknown_reseller");
  if (!on && (await db.prepare(`SELECT COUNT(*) AS n FROM reseller WHERE parent_id = ?`).bind(rid).first()).n > 0) throw new PanelError("has_subs");
  await db.prepare(`UPDATE reseller SET is_distributor = ? WHERE id = ?`).bind(on ? 1 : 0, rid).run();
}

// ---- Outils commerciaux ----

/** Activation en lot : codes séparés par lignes, virgules ou espaces. Résultat par code ; s'arrête quand les crédits manquent. */
export async function activateMany(db, rid, raw, actor, now = Date.now()) {
  const codes = [...new Set(String(raw ?? "").toUpperCase().split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))].slice(0, 200);
  const out = [];
  for (const [i, code] of codes.entries()) {
    try {
      await activate(db, rid, { code }, actor, now);
      out.push({ code, ok: true });
    } catch (e) {
      if (!(e instanceof PanelError)) throw e;
      out.push({ code, ok: false, error: e.code });
      if (e.code === "no_credit" || e.code === "reseller_suspended" || e.code === "agreement_required") {
        for (const c of codes.slice(i + 1)) out.push({ code: c, ok: false, error: e.code });
        break;
      }
    }
  }
  return out;
}

export const TRIAL_EXTENSION_MS = 7 * 24 * 3600_000;

/** Prolonge de 7 jours l'essai d'un appareil pas encore activé — une seule fois par appareil, gratuit. */
export async function extendTrial(db, rid, code, now = Date.now()) {
  const d = await deviceByCode(db, code);
  if (d.customer_id) throw new PanelError("already_active");
  const r = await getReseller(db, rid);
  if (!r || r.status !== "active") throw new PanelError("reseller_suspended");
  const res = await db.prepare(
    `UPDATE device SET trial_ends_at = MAX(trial_ends_at, ?) + ?, trial_extended = 1 WHERE id = ? AND trial_extended = 0 AND customer_id IS NULL`,
  ).bind(now, TRIAL_EXTENSION_MS, d.id).run();
  if (res.meta.changes !== 1) throw new PanelError("trial_already_extended");
  return { trialEndsAt: Math.max(d.trial_ends_at, now) + TRIAL_EXTENSION_MS };
}

/** Cellule CSV sûre : guillemets doublés, formules neutralisées (=, +, -, @ ouvriraient un calcul dans le tableur). */
export function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const isoDay = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

export async function customersCsv(db, rid) {
  const { results } = await db.prepare(
    `SELECT c.id, c.label, c.created_at,
            (SELECT MAX(expires_at) FROM license WHERE customer_id = c.id) AS expires_at,
            (SELECT status FROM license WHERE customer_id = c.id ORDER BY expires_at DESC LIMIT 1) AS lic_status,
            (SELECT GROUP_CONCAT(code, ' ') FROM device WHERE customer_id = c.id) AS codes
       FROM customer c WHERE c.reseller_id = ? ORDER BY c.created_at`,
  ).bind(rid).all();
  return toCsv([["customer_id", "label", "created", "license_status", "expires", "device_codes"],
    ...results.map((c) => [c.id, c.label, isoDay(c.created_at), c.lic_status, isoDay(c.expires_at), c.codes])]);
}

export async function ledgerCsv(db, rid) {
  const { results } = await db.prepare(`SELECT * FROM credit_ledger WHERE reseller_id = ? ORDER BY id`).bind(rid).all();
  return toCsv([["date", "delta", "reason", "note", "by"], ...results.map((e) => [new Date(e.created_at).toISOString(), e.delta, e.reason, e.note, e.created_by])]);
}
