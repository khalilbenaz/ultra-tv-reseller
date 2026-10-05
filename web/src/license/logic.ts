// Édition Pro : règles pures de la licence (signature Ed25519, droit d'utiliser l'application).
// Le Worker revendeur (ultratv-reseller) renvoie { payload, sig } : payload = JSON en base64url, sig = Ed25519(payload).

export interface LicensePayload {
  v: number;
  deviceId: string;
  code: string;
  status: "trial" | "active" | "expired" | "suspended";
  until: number | null;
  graceUntil: number | null;
  reseller: { name: string; whatsapp: string | null; telegram: string | null; text: string | null } | null;
  unread: number;
  issuedAt: number;
}

const b64uBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const b64Bytes = (s: string) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));

/** Vérifie la signature avec la clé publique SPKI (base64) et décode ; null si invalide. */
export async function verifyLicense(payload: string, sig: string, spkiB64: string): Promise<LicensePayload | null> {
  try {
    const key = await crypto.subtle.importKey("spki", b64Bytes(spkiB64), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64uBytes(sig), new TextEncoder().encode(payload));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64uBytes(payload))) as LicensePayload;
    return typeof p.deviceId === "string" && typeof p.code === "string" && typeof p.status === "string" ? p : null;
  } catch {
    return null;
  }
}

/**
 * Utilisation permise : essai ou licence active jusqu'au délai de grâce (hors ligne, dernier statut signé).
 * Une horloge reculée bien avant la date d'émission ne prolonge rien.
 */
export function licenseAllows(p: LicensePayload | null, now = Date.now()): boolean {
  if (!p || (p.status !== "trial" && p.status !== "active")) return false;
  const limit = p.graceUntil ?? p.until;
  if (!limit) return false;
  return now < limit && now >= p.issuedAt - 24 * 3600_000;
}

/** Jours restants (arrondis au supérieur) avant `until`. */
export function daysLeft(p: LicensePayload | null, now = Date.now()): number | null {
  if (!p?.until) return null;
  return p.until <= now ? 0 : Math.ceil((p.until - now) / 86_400_000);
}

/** Lien de contact du revendeur (WhatsApp prioritaire). */
export function supportLink(p: LicensePayload | null): string | null {
  if (p?.reseller?.whatsapp) return `https://wa.me/${p.reseller.whatsapp.replace(/^\+/, "")}`;
  if (p?.reseller?.telegram) return `https://t.me/${p.reseller.telegram}`;
  return null;
}
