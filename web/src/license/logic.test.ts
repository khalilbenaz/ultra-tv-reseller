import { describe, expect, it } from "vitest";
import { daysLeft, licenseAllows, supportLink, verifyLicense, type LicensePayload } from "./logic";

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function keys() {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const spki = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey))));
  return { kp, spki };
}
const now = 1_800_000_000_000;
const base: LicensePayload = { v: 1, deviceId: "d", code: "7F3K-92QD", status: "active", until: now + 1000, graceUntil: now + 5000, reseller: { name: "Basil", whatsapp: "+971500000000", telegram: null, text: null }, unread: 0, issuedAt: now };

async function signed(kp: CryptoKeyPair, p: LicensePayload) {
  const payload = b64u(new TextEncoder().encode(JSON.stringify(p)));
  const sig = b64u(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, kp.privateKey, new TextEncoder().encode(payload))));
  return { payload, sig };
}

describe("licence Pro", () => {
  it("signature valide → charge utile ; falsifiée ou autre clé → null", async () => {
    const { kp, spki } = await keys();
    const { payload, sig } = await signed(kp, base);
    expect((await verifyLicense(payload, sig, spki))?.code).toBe("7F3K-92QD");
    const forged = b64u(new TextEncoder().encode(JSON.stringify({ ...base, status: "active", until: 9e15 })));
    expect(await verifyLicense(forged, sig, spki)).toBeNull();
    expect(await verifyLicense(payload, sig, (await keys()).spki)).toBeNull();
  });
  it("droit d'utiliser : essai/actif jusqu'à la grâce, jamais expiré/suspendu, horloge reculée refusée", () => {
    expect(licenseAllows(base, now)).toBe(true);
    expect(licenseAllows({ ...base, until: now - 10 }, now)).toBe(true); // grâce hors ligne
    expect(licenseAllows({ ...base, until: now - 10, graceUntil: now - 1 }, now)).toBe(false);
    expect(licenseAllows({ ...base, status: "expired" }, now)).toBe(false);
    expect(licenseAllows({ ...base, status: "suspended" }, now)).toBe(false);
    expect(licenseAllows({ ...base, issuedAt: now + 3 * 86_400_000 }, now)).toBe(false);
    expect(licenseAllows(null, now)).toBe(false);
  });
  it("jours restants et lien support", () => {
    expect(daysLeft({ ...base, until: now + 6 * 86_400_000 + 1 }, now)).toBe(7);
    expect(supportLink(base)).toBe("https://wa.me/971500000000");
    expect(supportLink({ ...base, reseller: { name: "x", whatsapp: null, telegram: "basiltv", text: null } })).toBe("https://t.me/basiltv");
  });
});
