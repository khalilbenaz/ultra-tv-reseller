import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { registerDevice, loadDeviceContext, statusPayload, unreadCount } from "../src/license.js";
import {
  acceptAgreement, activate, addCredits, createReseller, deviceCap, inboxFor, markRead, setDeviceCap, setLicenseDevices,
  setDistributor, createSubReseller, setSubDeviceCap, updateProfile, detachDevice, customerDetail, createMessage,
} from "../src/panel.js";

const db = env.RESELLER;
let n = 0;
async function reseller({ credits = 10 } = {}) {
  n++;
  const id = await createReseller(db, { login: `dev${n}x${Date.now() % 100000}`, name: `Rev ${n}`, passwordHash: "x" });
  await acceptAgreement(db, id);
  if (credits) await addCredits(db, id, credits, "achat", "admin");
  return id;
}
const device = () => registerDevice(db, { platform: "android-tv" });
const err = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };

describe("appareils par licence", () => {
  it("le revendeur choisit le nombre d'appareils à l'activation, dans son plafond", async () => {
    const rid = await reseller();
    await setDeviceCap(db, rid, 4);
    const a = await device();
    const r = await activate(db, rid, { code: a.code, devices: "4" }, "rev");
    for (let i = 0; i < 3; i++) await activate(db, rid, { code: (await device()).code, customerId: r.customerId }, "rev");
    expect(await err(activate(db, rid, { code: (await device()).code, customerId: r.customerId }, "rev"))).toBe("device_limit");
    expect(await err(activate(db, rid, { code: (await device()).code, devices: 5 }, "rev"))).toBe("device_cap");
  });

  it("sans choix : 2 appareils, ou le plafond s'il est plus bas", async () => {
    const rid = await reseller();
    await setDeviceCap(db, rid, 1);
    const r = await activate(db, rid, { code: (await device()).code }, "rev");
    expect((await customerDetail(db, rid, r.customerId)).license.max_devices).toBe(1);
  });

  it("modifier la limite : jamais sous les appareils rattachés", async () => {
    const rid = await reseller();
    const r = await activate(db, rid, { code: (await device()).code, devices: 3 }, "rev");
    const b = await device();
    await activate(db, rid, { code: b.code, customerId: r.customerId }, "rev");
    expect(await err(setLicenseDevices(db, rid, r.customerId, 1))).toBe("devices_in_use");
    expect(await setLicenseDevices(db, rid, r.customerId, 2)).toBe(2);
    const ctx = await loadDeviceContext(db, b.installSecret);
    expect(statusPayload(ctx, 0).devices).toEqual({ used: 2, max: 2 });
    await detachDevice(db, rid, b.deviceId);
    expect(await setLicenseDevices(db, rid, r.customerId, 1)).toBe(1);
  });

  it("plafond d'un sous-revendeur borné par celui du distributeur", async () => {
    const did = await reseller();
    await setDistributor(db, did, true);
    await setDeviceCap(db, did, 3);
    const sid = await createSubReseller(db, did, { login: `sub${n}x${Date.now() % 100000}`, name: "Sub", passwordHash: "x" });
    expect(await err(setSubDeviceCap(db, did, sid, 4))).toBe("device_cap");
    await setSubDeviceCap(db, did, sid, 2);
    expect(await deviceCap(db, sid)).toBe(2);
    await setDeviceCap(db, did, 1);
    expect(await deviceCap(db, sid)).toBe(1);
  });
});

describe("rappel de renouvellement automatique", () => {
  it("apparaît dans la boîte de réception à J-15, compte comme non lu, se marque lu", async () => {
    const rid = await reseller();
    const d = await device();
    const r = await activate(db, rid, { code: d.code }, "rev");
    const ctx0 = await loadDeviceContext(db, d.installSecret);
    expect((await inboxFor(db, ctx0)).some((m) => m.kind === "renewal")).toBe(false);
    // Licence qui expire dans 10 jours.
    await db.prepare(`UPDATE license SET expires_at = ? WHERE customer_id = ?`).bind(Date.now() + 10 * 86_400_000, r.customerId).run();
    const ctx = await loadDeviceContext(db, d.installSecret);
    const box = await inboxFor(db, ctx);
    expect(box[0].kind).toBe("renewal");
    expect(box[0].read).toBe(false);
    expect(await unreadCount(db, ctx)).toBe(1);
    expect(await markRead(db, ctx, [box[0].id])).toBe(1);
    expect(await unreadCount(db, ctx)).toBe(0);
  });

  it("désactivé par le revendeur : aucun rappel", async () => {
    const rid = await reseller();
    await updateProfile(db, rid, { name: "Rev", reminderDays: "0" });
    const d = await device();
    const r = await activate(db, rid, { code: d.code }, "rev");
    await db.prepare(`UPDATE license SET expires_at = ? WHERE customer_id = ?`).bind(Date.now() + 3 * 86_400_000, r.customerId).run();
    expect((await inboxFor(db, await loadDeviceContext(db, d.installSecret))).length).toBe(0);
  });
});

describe("type d'annonce", () => {
  it("le type choisi arrive dans la boîte de réception ; un type inconnu devient « info »", async () => {
    const rid = await reseller();
    const d = await device();
    await activate(db, rid, { code: d.code }, "rev");
    await createMessage(db, rid, { target: "all", title: "Promo", body: "-20 %", category: "promo" });
    await createMessage(db, rid, { target: "all", title: "Autre", body: "x", category: "<script>" });
    const box = await inboxFor(db, await loadDeviceContext(db, d.installSecret));
    expect(box.find((m) => m.title === "Promo").category).toBe("promo");
    expect(box.find((m) => m.title === "Autre").category).toBe("info");
  });
});
