import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { registerDevice, loadDeviceContext, computeStatus } from "../src/license.js";
import {
  YEAR_MS, acceptAgreement, activate, addCredits, balance, createMessage, createReseller, customerDetail, detachDevice,
  inboxFor, listCustomers, markRead, renew, setCustomerSuspended, setResellerStatus, dashboardStats,
} from "../src/panel.js";

const db = env.RESELLER;
let n = 0;
async function reseller({ credits = 10, agree = true } = {}) {
  n++;
  const id = await createReseller(db, { login: `rev${n}x${Date.now() % 100000}`, name: `Revendeur ${n}`, passwordHash: "x" });
  if (agree) await acceptAgreement(db, id);
  if (credits) await addCredits(db, id, credits, "achat", "admin");
  return id;
}
const device = () => registerDevice(db, { platform: "android-tv" });
const err = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };

describe("activation", () => {
  it("nouveau client : 1 crédit, licence 1 an, appareil actif", async () => {
    const rid = await reseller({ credits: 3 });
    const d = await device();
    const r = await activate(db, rid, { code: d.code.toLowerCase().replace("-", " "), label: "Ahmed" }, "rev");
    expect(r.credited).toBe(1);
    expect(await balance(db, rid)).toBe(2);
    const ctx = await loadDeviceContext(db, d.installSecret);
    const st = computeStatus(ctx);
    expect(st.status).toBe("active");
    expect(st.until - Date.now()).toBeGreaterThan(YEAR_MS - 60_000);
  });

  it("sans crédit : refusé, rien n'est créé", async () => {
    const rid = await reseller({ credits: 0 });
    const d = await device();
    expect(await err(activate(db, rid, { code: d.code }, "rev"))).toBe("no_credit");
    expect((await listCustomers(db, rid)).length).toBe(0);
    expect((await db.prepare(`SELECT customer_id FROM device WHERE id = ?`).bind(d.deviceId).first()).customer_id).toBeNull();
  });

  it("contrat non accepté ou revendeur suspendu : refusé sans débit", async () => {
    const rid = await reseller({ agree: false });
    expect(await err(activate(db, rid, { code: (await device()).code }, "rev"))).toBe("agreement_required");
    expect(await balance(db, rid)).toBe(10);
    const rid2 = await reseller();
    await setResellerStatus(db, rid2, "suspended");
    expect(await err(activate(db, rid2, { code: (await device()).code }, "rev"))).toBe("reseller_suspended");
    expect(await balance(db, rid2)).toBe(10);
  });

  it("code inconnu, invalide, déjà actif", async () => {
    const rid = await reseller();
    expect(await err(activate(db, rid, { code: "2222-2222" }, "rev"))).toBe("unknown_code");
    expect(await err(activate(db, rid, { code: "abc" }, "rev"))).toBe("invalid_code");
    const d = await device();
    await activate(db, rid, { code: d.code }, "rev");
    expect(await err(activate(db, rid, { code: d.code }, "rev"))).toBe("already_active");
    expect(await balance(db, rid)).toBe(9);
  });

  it("dix activations simultanées du même code : une seule passe, un seul crédit débité", async () => {
    const rid = await reseller({ credits: 10 });
    const d = await device();
    const out = await Promise.allSettled(Array.from({ length: 10 }, () => activate(db, rid, { code: d.code }, "rev")));
    expect(out.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect(await balance(db, rid)).toBe(9);
    expect((await listCustomers(db, rid)).length).toBe(1);
  });

  it("1 crédit et cinq codes en même temps : une seule activation, solde jamais négatif", async () => {
    const rid = await reseller({ credits: 1 });
    const codes = await Promise.all(Array.from({ length: 5 }, device));
    const out = await Promise.allSettled(codes.map((d) => activate(db, rid, { code: d.code }, "rev")));
    expect(out.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect(await balance(db, rid)).toBe(0);
  });

  it("deuxième appareil du client : gratuit, puis limite de 2 appareils", async () => {
    const rid = await reseller({ credits: 5 });
    const a = await device(), b = await device(), c = await device();
    const { customerId } = await activate(db, rid, { code: a.code }, "rev");
    const r2 = await activate(db, rid, { code: b.code, customerId }, "rev");
    expect(r2.credited).toBe(0);
    expect(await balance(db, rid)).toBe(4);
    expect(computeStatus(await loadDeviceContext(db, b.installSecret)).status).toBe("active");
    expect(await err(activate(db, rid, { code: c.code, customerId }, "rev"))).toBe("device_limit");
    // Changement de box : on détache, la place se libère.
    await detachDevice(db, rid, b.deviceId);
    expect((await activate(db, rid, { code: c.code, customerId }, "rev")).credited).toBe(0);
    expect((await customerDetail(db, rid, customerId)).devices.length).toBe(2);
  });

  it("un revendeur ne touche jamais aux clients d'un autre", async () => {
    const r1 = await reseller(), r2 = await reseller();
    const a = await device(), b = await device();
    const { customerId } = await activate(db, r1, { code: a.code }, "rev");
    expect(await err(activate(db, r2, { code: b.code, customerId }, "rev"))).toBe("unknown_customer");
    expect(await err(renew(db, r2, customerId, "rev"))).toBe("unknown_customer");
    expect(await err(setCustomerSuspended(db, r2, customerId, true))).toBe("unknown_customer");
    expect(await err(detachDevice(db, r2, a.deviceId))).toBe("unknown_device");
    expect(await err(customerDetail(db, r2, customerId))).toBe("unknown_customer");
  });
});

describe("renouvellement, suspension", () => {
  it("renouveler ajoute 1 an à la fin actuelle et coûte 1 crédit", async () => {
    const rid = await reseller({ credits: 2 });
    const d = await device();
    const { customerId } = await activate(db, rid, { code: d.code }, "rev");
    const before = (await customerDetail(db, rid, customerId)).license.expires_at;
    await renew(db, rid, customerId, "rev");
    expect((await customerDetail(db, rid, customerId)).license.expires_at).toBe(before + YEAR_MS);
    expect(await balance(db, rid)).toBe(0);
    expect(await err(renew(db, rid, customerId, "rev"))).toBe("no_credit");
  });

  it("licence expirée renouvelée : repart d'aujourd'hui", async () => {
    const rid = await reseller({ credits: 2 });
    const d = await device();
    const { customerId, licenseId } = await activate(db, rid, { code: d.code }, "rev");
    await db.prepare(`UPDATE license SET expires_at = ? WHERE id = ?`).bind(Date.now() - 10 * 24 * 3600_000, licenseId).run();
    const t = Date.now();
    await renew(db, rid, customerId, "rev");
    const exp = (await customerDetail(db, rid, customerId)).license.expires_at;
    expect(exp).toBeGreaterThanOrEqual(t + YEAR_MS);
    expect(exp).toBeLessThan(t + YEAR_MS + 60_000);
  });

  it("suspendre un client coupe ses appareils, réactiver les rétablit", async () => {
    const rid = await reseller();
    const d = await device();
    const { customerId } = await activate(db, rid, { code: d.code }, "rev");
    await setCustomerSuspended(db, rid, customerId, true);
    expect(computeStatus(await loadDeviceContext(db, d.installSecret)).status).toBe("suspended");
    await setCustomerSuspended(db, rid, customerId, false);
    expect(computeStatus(await loadDeviceContext(db, d.installSecret)).status).toBe("active");
  });
});

describe("crédits (administration)", () => {
  it("ajout, correction négative bornée au solde", async () => {
    const rid = await reseller({ credits: 5 });
    await addCredits(db, rid, -3, "erreur de saisie", "admin");
    expect(await balance(db, rid)).toBe(2);
    expect(await err(addCredits(db, rid, -5, "", "admin"))).toBe("no_credit");
    expect(await err(addCredits(db, rid, 0, "", "admin"))).toBe("invalid_amount");
    expect(await balance(db, rid)).toBe(2);
  });

  it("statistiques du tableau de bord", async () => {
    const rid = await reseller({ credits: 4 });
    await activate(db, rid, { code: (await device()).code }, "rev");
    const s = await dashboardStats(db, rid);
    expect(s).toMatchObject({ balance: 3, monthOps: 1, customers: 1, expiringSoon: 0 });
  });
});

describe("annonces", () => {
  it("ciblage, lecture marquée seulement pour ce que l'appareil peut voir", async () => {
    const rid = await reseller();
    const a = await device(), b = await device();
    const { customerId: ca } = await activate(db, rid, { code: a.code }, "rev");
    const { customerId: cb } = await activate(db, rid, { code: b.code }, "rev");
    const all = await createMessage(db, rid, { target: "all", title: "Maintenance", body: "Ce soir 23h" });
    const onlyB = await createMessage(db, rid, { target: cb, title: "Pour B", body: "x" });
    const ctxA = await loadDeviceContext(db, a.installSecret);
    const inbox = await inboxFor(db, ctxA);
    expect(inbox.map((m) => m.id)).toEqual([all]);
    expect(await markRead(db, ctxA, [all, onlyB])).toBe(1);
    expect((await inboxFor(db, ctxA))[0].read).toBe(true);
    expect(await err(createMessage(db, rid, { target: "all", title: "", body: "x" }))).toBe("message_empty");
    expect(ca).not.toBe(cb);
  });
});
