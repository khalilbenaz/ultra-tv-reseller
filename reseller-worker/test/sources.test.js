import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { registerDevice } from "../src/license.js";
import { acceptAgreement, activate, addCredits, createReseller, setCustomerSuspended } from "../src/panel.js";
import { customerOfCode, getCustomerSource, parseSourceForm, removeCustomerSource, setCustomerSource } from "../src/sources.js";

const db = env.RESELLER;
let n = 0;
const err = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };
async function reseller() {
  const id = await createReseller(db, { login: `src${++n}x${Date.now() % 100000}`, name: "R", passwordHash: "x" });
  await acceptAgreement(db, id);
  await addCredits(db, id, 5, "achat", "admin");
  return id;
}
const XT = { kind: "xtream", name: "Ma TV", server: "http://line.example.com:8080/", username: "client1", password: "s3cret-pass" };
let ipN = 0;
const sources = (secret) => exports.default.fetch(new Request("https://reseller.test/api/lic/sources", { headers: { authorization: `Bearer ${secret}`, "cf-connecting-ip": `203.0.114.${++ipN % 250}` } }));

describe("saisie de l'abonnement", () => {
  it("Xtream normalisé ; M3U ; refus des adresses invalides et des identifiants manquants", () => {
    expect(parseSourceForm(XT)).toEqual({ kind: "xtream", name: "Ma TV", server: "http://line.example.com:8080", username: "client1", password: "s3cret-pass" });
    expect(parseSourceForm({ kind: "m3u", url: "https://x.example/get.php?u=1&p=2" })).toMatchObject({ kind: "m3u", name: "IPTV" });
    expect(() => parseSourceForm({ ...XT, server: "ftp://x" })).toThrow();
    expect(() => parseSourceForm({ ...XT, server: "http://user:pw@x.example" })).toThrow();
    expect(() => parseSourceForm({ ...XT, password: "" })).toThrow();
    expect(() => parseSourceForm({ kind: "m3u", url: "javascript:alert(1)" })).toThrow();
  });
  it("mot de passe laissé vide = inchangé lors d'une mise à jour", () => {
    expect(parseSourceForm({ ...XT, password: "" }, { kind: "xtream", password: "ancien" }).password).toBe("ancien");
  });
});

describe("abonnement d'un client", () => {
  it("par code appareil : appareil à activer d'abord ; code d'un autre revendeur refusé", async () => {
    const r1 = await reseller(), r2 = await reseller();
    const d = await registerDevice(db, {});
    expect(await err(customerOfCode(db, r1, d.code))).toBe("activate_first");
    const { customerId } = await activate(db, r1, { code: d.code }, "r1");
    expect(await customerOfCode(db, r1, d.code.toLowerCase())).toBe(customerId);
    expect(await err(customerOfCode(db, r2, d.code))).toBe("unknown_customer");
    expect(await err(setCustomerSource(env, r2, customerId, XT, "r2"))).toBe("unknown_customer");
  });

  it("chiffré au repos : ni le mot de passe ni l'identifiant n'apparaissent dans la base", async () => {
    const r = await reseller();
    const { customerId } = await activate(db, r, { code: (await registerDevice(db, {})).code }, "r");
    await setCustomerSource(env, r, customerId, XT, "r");
    const row = await db.prepare(`SELECT * FROM customer_source WHERE customer_id = ?`).bind(customerId).first();
    expect(JSON.stringify(row)).not.toContain("s3cret-pass");
    expect(JSON.stringify(row)).not.toContain("client1");
    expect((await getCustomerSource(env, customerId)).password).toBe("s3cret-pass");
  });

  it("l'appareil reçoit l'abonnement tant que la licence est active ; rien en essai, suspendu ou après retrait", async () => {
    const r = await reseller();
    const d = await registerDevice(db, {});
    expect((await (await sources(d.installSecret)).json()).sources).toEqual([]);
    const { customerId } = await activate(db, r, { code: d.code }, "r");
    await setCustomerSource(env, r, customerId, XT, "r");
    const got = (await (await sources(d.installSecret)).json()).sources;
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: "xtream", name: "Ma TV", server: "http://line.example.com:8080", username: "client1", password: "s3cret-pass" });
    await setCustomerSuspended(db, r, customerId, true);
    expect((await (await sources(d.installSecret)).json()).sources).toEqual([]);
    await setCustomerSuspended(db, r, customerId, false);
    await removeCustomerSource(env, r, customerId);
    expect((await (await sources(d.installSecret)).json()).sources).toEqual([]);
    expect((await sources("x".repeat(43))).status).toBe(401);
  });

  it("mise à jour : remplace l'abonnement, horodatage avancé", async () => {
    const r = await reseller();
    const { customerId } = await activate(db, r, { code: (await registerDevice(db, {})).code }, "r");
    await setCustomerSource(env, r, customerId, XT, "r", 1000);
    await setCustomerSource(env, r, customerId, { kind: "m3u", name: "Autre", url: "https://m3u.example/list.m3u" }, "r", 2000);
    expect(await getCustomerSource(env, customerId)).toMatchObject({ kind: "m3u", name: "Autre", url: "https://m3u.example/list.m3u", updatedAt: 2000 });
  });
});
