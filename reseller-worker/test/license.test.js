import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { GRACE_MS, TRIAL_MS, computeStatus, newDeviceCode, normalizeDeviceCode } from "../src/license.js";

let ipN = 0;
const freshIp = () => { ipN++; return `198.51.${(ipN >> 8) & 255}.${ipN & 255}`; };
const ORIGIN = "https://reseller.test";
function call(path, { method = "GET", json, token, ip = freshIp() } = {}) {
  const h = new Headers({ "cf-connecting-ip": ip });
  if (token) h.set("authorization", `Bearer ${token}`);
  if (json !== undefined) h.set("content-type", "application/json");
  return exports.default.fetch(new Request(ORIGIN + path, { method, headers: h, body: json === undefined ? undefined : JSON.stringify(json) }));
}

const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
/** Vérifie la signature comme le fera l'app (clé publique embarquée) et renvoie la charge utile. */
async function verify({ payload, sig }) {
  const pub = await crypto.subtle.importKey("spki", Uint8Array.from(atob(env.TEST_PUBLIC_KEY), (c) => c.charCodeAt(0)), { name: "Ed25519" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, pub, b64u(sig), new TextEncoder().encode(payload));
  return ok ? JSON.parse(new TextDecoder().decode(b64u(payload))) : null;
}

async function register(info = { platform: "android-tv", model: "Box X", appVersion: "1.3.0" }) {
  const res = await call("/api/lic/register", { method: "POST", json: info });
  expect(res.status).toBe(201);
  return res.json();
}
async function status(token) {
  const res = await call("/api/lic/status?v=1.3.1", { token });
  return { res, body: res.status === 200 ? await verify(await res.json()) : null };
}

/** Revendeur + client + licence, rattachés à l'appareil (ce que fera l'activation du panneau, étape 2). */
async function attach(deviceId, { resellerStatus = "active", expiresIn = 365 * 24 * 3600_000, licStatus = "active" } = {}) {
  const now = Date.now();
  const rid = crypto.randomUUID(), cid = crypto.randomUUID();
  await env.RESELLER.batch([
    env.RESELLER.prepare(`INSERT INTO reseller (id, login, name, support_whatsapp, status, created_at) VALUES (?, ?, 'Basil TV', '+971500000000', ?, ?)`).bind(rid, `r-${rid}`, resellerStatus, now),
    env.RESELLER.prepare(`INSERT INTO customer (id, reseller_id, label, created_at) VALUES (?, ?, 'Client 1', ?)`).bind(cid, rid, now),
    env.RESELLER.prepare(`INSERT INTO license (id, customer_id, starts_at, expires_at, status) VALUES (?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), cid, now, now + expiresIn, licStatus),
    env.RESELLER.prepare(`UPDATE device SET customer_id = ? WHERE id = ?`).bind(cid, deviceId),
  ]);
  return { rid, cid };
}

describe("code appareil", () => {
  it("format XXXX-XXXX, alphabet sans caractères ambigus", () => {
    for (let i = 0; i < 200; i++) expect(newDeviceCode()).toMatch(/^[2-9A-HJKMNP-TW-Z]{4}-[2-9A-HJKMNP-TW-Z]{4}$/);
  });
  it("saisie libre normalisée, codes invalides refusés", () => {
    expect(normalizeDeviceCode(" 7f3k 92qd ")).toBe("7F3K-92QD");
    expect(normalizeDeviceCode("7F3K92QD")).toBe("7F3K-92QD");
    expect(normalizeDeviceCode("7F3K-92Q0")).toBeNull(); // 0 exclu
    expect(normalizeDeviceCode("7F3K")).toBeNull();
    expect(normalizeDeviceCode(42)).toBeNull();
  });
});

describe("computeStatus", () => {
  const now = 1_000_000_000_000;
  const device = { trial_ends_at: now + 1000 };
  it("essai, puis expiré à la fin de l'essai", () => {
    expect(computeStatus({ device }, now).status).toBe("trial");
    expect(computeStatus({ device }, now + 2000).status).toBe("expired");
  });
  it("licence valide prioritaire sur l'essai ; expirée = expired", () => {
    expect(computeStatus({ device, license: { status: "active", expires_at: now + 5000 }, reseller: { status: "active" } }, now)).toEqual({ status: "active", until: now + 5000 });
    expect(computeStatus({ device, license: { status: "active", expires_at: now - 1 }, reseller: { status: "active" } }, now).status).toBe("expired");
  });
  it("licence suspendue : suspended ; revendeur suspendu : la licence payée reste valide", () => {
    expect(computeStatus({ device, license: { status: "active", expires_at: now + 5000 }, reseller: { status: "suspended" } }, now).status).toBe("active");
    expect(computeStatus({ device, license: { status: "suspended", expires_at: now + 5000 }, reseller: { status: "active" } }, now).status).toBe("suspended");
  });
});

describe("API /api/lic", () => {
  it("enregistrement : code, secret, essai de 7 jours ; le secret n'est pas stocké en clair", async () => {
    const before = Date.now();
    const r = await register();
    expect(r.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect(r.installSecret.length).toBeGreaterThan(30);
    expect(r.trialEndsAt).toBeGreaterThanOrEqual(before + TRIAL_MS);
    const row = await env.RESELLER.prepare(`SELECT * FROM device WHERE id = ?`).bind(r.deviceId).first();
    expect(JSON.stringify(row)).not.toContain(r.installSecret);
    expect(row.model).toBe("Box X");
  });

  it("statut signé : essai, avec délai de grâce hors ligne ; signature vérifiable par l'app", async () => {
    const r = await register();
    const { res, body } = await status(r.installSecret);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ v: 1, deviceId: r.deviceId, code: r.code, status: "trial", until: r.trialEndsAt, reseller: null, unread: 0 });
    expect(body.graceUntil).toBe(r.trialEndsAt + GRACE_MS);
  });

  it("signature falsifiée détectée", async () => {
    const r = await register();
    const signed = await (await call("/api/lic/status", { token: r.installSecret })).json();
    const forged = btoa(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(b64u(signed.payload))), status: "active", until: 9e15 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verify({ payload: forged, sig: signed.sig })).toBeNull();
  });

  it("secret inconnu ou absent : 401", async () => {
    expect((await call("/api/lic/status", { token: "x".repeat(43) })).status).toBe(401);
    expect((await call("/api/lic/status")).status).toBe(401);
  });

  it("appareil activé : licence active, revendeur et contact support renvoyés", async () => {
    const r = await register();
    await attach(r.deviceId);
    const { body } = await status(r.installSecret);
    expect(body.status).toBe("active");
    expect(body.reseller).toEqual({ name: "Basil TV", whatsapp: "+971500000000", telegram: null, text: null });
    expect(body.graceUntil).toBe(body.until + GRACE_MS);
  });

  it("licence expirée : expired, pas de délai de grâce", async () => {
    const r = await register();
    await attach(r.deviceId, { expiresIn: -1000 });
    const { body } = await status(r.installSecret);
    expect(body.status).toBe("expired");
    expect(body.graceUntil).toBeNull();
  });

  it("revendeur suspendu : ses clients gardent leur licence payée", async () => {
    const r = await register();
    await attach(r.deviceId, { resellerStatus: "suspended" });
    expect((await status(r.installSecret)).body.status).toBe("active");
  });

  it("licence d'un client suspendue explicitement : suspended", async () => {
    const r = await register();
    await attach(r.deviceId, { licStatus: "suspended" });
    expect((await status(r.installSecret)).body.status).toBe("suspended");
  });

  it("annonces non lues : celles du revendeur et celles du client, pas celles des autres ni les expirées", async () => {
    const r = await register();
    const { rid, cid } = await attach(r.deviceId);
    const other = await attach((await register()).deviceId);
    const now = Date.now();
    const msg = (res, target, exp = null) => env.RESELLER.prepare(`INSERT INTO message (id, reseller_id, target, title, body, created_at, expires_at) VALUES (?, ?, ?, 't', 'b', ?, ?)`).bind(crypto.randomUUID(), res, target, now, exp);
    await env.RESELLER.batch([
      msg(rid, "all"), msg(rid, `customer:${cid}`), msg(rid, "customer:someone-else"), msg(rid, "all", now - 1), msg(other.rid, "all"),
    ]);
    expect((await status(r.installSecret)).body.unread).toBe(2);
  });

  it("« vu » et version de l'app mis à jour", async () => {
    const r = await register();
    await env.RESELLER.prepare(`UPDATE device SET last_seen_at = 0 WHERE id = ?`).bind(r.deviceId).run();
    await status(r.installSecret);
    const row = await env.RESELLER.prepare(`SELECT last_seen_at, app_version FROM device WHERE id = ?`).bind(r.deviceId).first();
    expect(row.app_version).toBe("1.3.1");
    expect(row.last_seen_at).toBeGreaterThan(0);
  });

  it("enregistrement limité par IP (20 / heure)", async () => {
    const ip = freshIp();
    let last;
    for (let i = 0; i < 21; i++) last = await call("/api/lic/register", { method: "POST", json: {}, ip });
    expect(last.status).toBe(429);
  });

  it("corps invalide refusé, champs bornés", async () => {
    const res = await exports.default.fetch(new Request(ORIGIN + "/api/lic/register", { method: "POST", headers: { "cf-connecting-ip": freshIp() }, body: "[1,2]" }));
    expect(res.status).toBe(400);
    // Texte stocké tel quel sans caractères de contrôle, borné ; l'échappement HTML se fait à l'affichage (panneau).
    const r = await register({ platform: "p".repeat(500), model: "Box  X" });
    const row = await env.RESELLER.prepare(`SELECT platform, model FROM device WHERE id = ?`).bind(r.deviceId).first();
    expect(row.platform.length).toBeLessThanOrEqual(24);
    expect(row.model).toBe("Box X");
  });
});
