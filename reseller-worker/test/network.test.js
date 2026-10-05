import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { computeStatus, loadDeviceContext, registerDevice, unreadCount } from "../src/license.js";
import {
  acceptAgreement, activate, activateMany, addCredits, balance, createMessage, createReseller, createSubReseller, csvCell,
  customersCsv, extendTrial, inboxFor, ledger, ledgerCsv, listSubResellers, networkStats, reclaimCredits, setDistributor,
  setResellerStatus, setSubStatus, transferCredits, TRIAL_EXTENSION_MS,
} from "../src/panel.js";

const db = env.RESELLER;
let n = 0;
const uniq = () => `${++n}x${Date.now() % 100000}`;
const err = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };
const device = () => registerDevice(db, { platform: "android-tv" });

async function dist(credits = 20) {
  const id = await createReseller(db, { login: `dist${uniq()}`, name: "Distributeur", passwordHash: "x", isDistributor: true });
  await acceptAgreement(db, id);
  if (credits) await addCredits(db, id, credits, "achat", "admin");
  return id;
}
async function sub(did, { agree = true } = {}) {
  const id = await createSubReseller(db, did, { login: `sub${uniq()}`, name: "Sous-revendeur", passwordHash: "x" });
  if (agree) await acceptAgreement(db, id);
  return id;
}

describe("réseau : création et droits", () => {
  it("seul un distributeur crée des sous-revendeurs ; un sous-revendeur ne peut pas en créer", async () => {
    const plain = await createReseller(db, { login: `plain${uniq()}`, name: "Simple", passwordHash: "x" });
    expect(await err(createSubReseller(db, plain, { login: `s${uniq()}`, name: "S", passwordHash: "x" }))).toBe("not_distributor");
    const d = await dist();
    const s = await sub(d);
    expect(await err(createSubReseller(db, s, { login: `s${uniq()}`, name: "S", passwordHash: "x" }))).toBe("not_distributor");
    expect((await listSubResellers(db, d)).map((x) => x.id)).toEqual([s]);
  });

  it("un distributeur ne touche pas aux sous-revendeurs d'un autre", async () => {
    const d1 = await dist(), d2 = await dist();
    const s2 = await sub(d2);
    expect(await err(transferCredits(db, d1, s2, 1, "d1"))).toBe("unknown_reseller");
    expect(await err(setSubStatus(db, d1, s2, "suspended"))).toBe("unknown_reseller");
    expect(await err(reclaimCredits(db, d1, s2, 1, "d1"))).toBe("unknown_reseller");
  });

  it("administration : promouvoir, et refus de rétrograder un distributeur qui a un réseau", async () => {
    const r = await createReseller(db, { login: `promo${uniq()}`, name: "P", passwordHash: "x" });
    await setDistributor(db, r, true);
    await sub(r);
    expect(await err(setDistributor(db, r, false))).toBe("has_subs");
  });
});

describe("transferts de crédits", () => {
  it("transfert puis reprise : soldes et grand livre cohérents", async () => {
    const d = await dist(10);
    const s = await sub(d);
    await transferCredits(db, d, s, 4, "d");
    expect([await balance(db, d), await balance(db, s)]).toEqual([6, 4]);
    await reclaimCredits(db, d, s, 3, "d");
    expect([await balance(db, d), await balance(db, s)]).toEqual([9, 1]);
    expect(await err(reclaimCredits(db, d, s, 2, "d"))).toBe("no_credit");
    expect((await ledger(db, s)).map((e) => e.delta)).toEqual([-3, 4]);
  });

  it("dix transferts simultanés de 3 crédits sur un solde de 10 : jamais de négatif, rien de créé ni perdu", async () => {
    const d = await dist(10);
    const s = await sub(d);
    const out = await Promise.allSettled(Array.from({ length: 10 }, () => transferCredits(db, d, s, 3, "d")));
    const ok = out.filter((x) => x.status === "fulfilled").length;
    expect(ok).toBe(3);
    expect(await balance(db, d)).toBe(1);
    expect(await balance(db, s)).toBe(9);
  });

  it("montants invalides refusés", async () => {
    const d = await dist(5);
    const s = await sub(d);
    for (const a of [0, -1, "abc", 1e9]) expect(await err(transferCredits(db, d, s, a, "d"))).toBe("invalid_amount");
  });

  it("le sous-revendeur active avec les crédits reçus", async () => {
    const d = await dist(5);
    const s = await sub(d);
    await transferCredits(db, d, s, 1, "d");
    const dev = await device();
    await activate(db, s, { code: dev.code }, "s");
    expect(await balance(db, s)).toBe(0);
    expect(computeStatus(await loadDeviceContext(db, dev.installSecret)).status).toBe("active");
    const st = await networkStats(db, d);
    expect(st).toMatchObject({ subs: 1, activeSubs: 1, subCredits: 0, networkCustomers: 1, networkOps30: 1 });
  });
});

describe("suspension en cascade", () => {
  it("distributeur suspendu → activations refusées au réseau, mais les clients gardent leur licence payée", async () => {
    const d = await dist(5);
    const s = await sub(d);
    await transferCredits(db, d, s, 2, "d");
    const dev = await device();
    await activate(db, s, { code: dev.code }, "s");
    await setResellerStatus(db, d, "suspended");
    expect(computeStatus(await loadDeviceContext(db, dev.installSecret)).status).toBe("active");
    expect(await err(activate(db, s, { code: (await device()).code }, "s"))).toBe("reseller_suspended");
    expect(await balance(db, s)).toBe(1);
    await setResellerStatus(db, d, "active");
    expect(computeStatus(await loadDeviceContext(db, dev.installSecret)).status).toBe("active");
  });

  it("le distributeur suspend un sous-revendeur : ses clients restent actifs, ses activations sont refusées", async () => {
    const d = await dist(5);
    const s1 = await sub(d), s2 = await sub(d);
    await transferCredits(db, d, s1, 1, "d");
    await transferCredits(db, d, s2, 1, "d");
    const a = await device(), b = await device();
    await activate(db, s1, { code: a.code }, "s1");
    await activate(db, s2, { code: b.code }, "s2");
    await setSubStatus(db, d, s1, "suspended");
    expect(computeStatus(await loadDeviceContext(db, a.installSecret)).status).toBe("active");
    expect(computeStatus(await loadDeviceContext(db, b.installSecret)).status).toBe("active");
    expect(await err(activate(db, s1, { code: (await device()).code }, "s1"))).toBe("reseller_suspended");
  });
});

describe("annonces réseau", () => {
  it("le distributeur écrit à tout son réseau ; un revendeur simple ne peut pas", async () => {
    const d = await dist(5);
    const s = await sub(d);
    await transferCredits(db, d, s, 1, "d");
    const dev = await device();
    await activate(db, s, { code: dev.code }, "s");
    await createMessage(db, d, { target: "network", title: "Maintenance réseau", body: "23h" });
    await createMessage(db, s, { target: "all", title: "Du sous-revendeur", body: "x" });
    const ctx = await loadDeviceContext(db, dev.installSecret);
    expect((await inboxFor(db, ctx)).map((m) => m.title).sort()).toEqual(["Du sous-revendeur", "Maintenance réseau"]);
    expect(await unreadCount(db, ctx)).toBe(2);
    expect(await err(createMessage(db, s, { target: "network", title: "x", body: "y" }))).toBe("not_distributor");
  });
});

describe("outils commerciaux", () => {
  it("activation en lot : résultat par code, arrêt propre quand les crédits manquent", async () => {
    const d = await dist(2);
    const codes = await Promise.all([device(), device(), device()]);
    const out = await activateMany(db, d, `${codes[0].code}\n${codes[1].code.toLowerCase()}, BAD!, ${codes[2].code}`, "d");
    expect(out.map((x) => x.ok)).toEqual([true, true, false, false]);
    expect(out[2].error).toBe("invalid_code");
    expect(out[3].error).toBe("no_credit");
    expect(await balance(db, d)).toBe(0);
  });

  it("prolongation d'essai : +7 jours une seule fois, jamais sur un appareil activé", async () => {
    const d = await dist(1);
    const dev = await device();
    const r = await extendTrial(db, d, dev.code);
    expect(r.trialEndsAt).toBeGreaterThanOrEqual(dev.trialEndsAt + TRIAL_EXTENSION_MS);
    expect(await err(extendTrial(db, d, dev.code))).toBe("trial_already_extended");
    const other = await device();
    await activate(db, d, { code: other.code }, "d");
    expect(await err(extendTrial(db, d, other.code))).toBe("already_active");
  });

  it("CSV : formules neutralisées, guillemets échappés, export clients et grand livre", async () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell(null)).toBe("");
    const d = await dist(3);
    const dev = await device();
    await activate(db, d, { code: dev.code, label: "@Ahmed" }, "d");
    const c = await customersCsv(db, d);
    expect(c).toContain("'@Ahmed");
    expect(c).toContain(dev.code);
    expect((await ledgerCsv(db, d)).split("\r\n")[0]).toContain("date,delta,reason");
  });
});
