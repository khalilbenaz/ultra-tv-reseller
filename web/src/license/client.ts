// Édition Pro : client du Worker revendeur (enregistrement, statut signé, annonces).
// Dans Electron, les requêtes passent par le processus principal (pas de CORS côté Worker), comme le cloud.

import { getSetting, setSetting } from "@/db/db";
import { bridge } from "@/net/transport";
import { decryptSecret, encryptSecret } from "@/net/secrets";
import { LICENSE_PUBKEY, LICENSE_URL } from "@/edition";
import { verifyLicense, type LicensePayload } from "./logic";
import type { ResellerSource } from "./provision";

interface Res { status: number; text: string }
type Http = (req: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => Promise<Res>;

const defaultHttp: Http = async (req) => {
  const b = bridge() as { cloudRequest?: Http } | undefined;
  if (b?.cloudRequest) return b.cloudRequest(req);
  const r = await fetch(req.url, { method: req.method ?? "GET", headers: req.headers, body: req.body, redirect: "manual" });
  return { status: r.status, text: await r.text() };
};
let http: Http = defaultHttp;
/** Transport remplaçable (tests). */
export function setLicenseHttp(h: Http | null) { http = h ?? defaultHttp; }

const K = { secret: "lic.secret", code: "lic.code", payload: "lic.payload", sig: "lic.sig" };
const JSON_H = { "content-type": "application/json", accept: "application/json" };

/** Annonce du revendeur, ou rappel automatique (`kind = "renewal"` : texte traduit par l'app à partir de `until`). */
export interface Announcement { id: string; title: string; body: string; at: number; kind?: string; until?: number | null; category?: string; read: boolean }

async function secret(): Promise<string | null> {
  const enc = await getSetting<string>(K.secret, "");
  if (!enc) return null;
  try { return (await decryptSecret(enc)) || null; } catch { return null; }
}

export const deviceCode = () => getSetting<string>(K.code, "");

/** Dernier statut signé connu, vérifié à nouveau. */
export async function cachedLicense(): Promise<LicensePayload | null> {
  const p = await getSetting<string>(K.payload, ""), s = await getSetting<string>(K.sig, "");
  return p && s ? verifyLicense(p, s, LICENSE_PUBKEY) : null;
}

/** Dernier statut signé reçu, TEL QUEL (il n'est enregistré qu'après vérification), pour le tableau de bord du compte. */
export async function signedLicense(): Promise<{ payload: string; sig: string } | null> {
  const payload = await getSetting<string>(K.payload, ""), sig = await getSetting<string>(K.sig, "");
  return payload && sig ? { payload, sig } : null;
}

async function ensureRegistered(platform: string, appVersion: string): Promise<string> {
  const existing = await secret();
  if (existing) return existing;
  const r = await http({ url: `${LICENSE_URL}/api/lic/register`, method: "POST", headers: JSON_H, body: JSON.stringify({ platform, model: platform, appVersion }) });
  if (r.status !== 201) throw new Error(`register ${r.status}`);
  const o = JSON.parse(r.text) as { installSecret: string; code: string };
  await setSetting(K.secret, await encryptSecret(o.installSecret));
  await setSetting(K.code, o.code);
  return o.installSecret;
}

/** Statut à jour (enregistre l'appareil au premier lancement). Lève si le serveur est injoignable. */
export async function refreshLicense(platform: string, appVersion: string): Promise<LicensePayload> {
  const sec = await ensureRegistered(platform, appVersion);
  const r = await http({ url: `${LICENSE_URL}/api/lic/status?v=${encodeURIComponent(appVersion)}`, headers: { authorization: `Bearer ${sec}`, accept: "application/json" } });
  if (r.status === 401) {
    // Inconnu du serveur : nouvel enregistrement au prochain essai.
    await Promise.all([setSetting(K.secret, ""), setSetting(K.payload, ""), setSetting(K.sig, "")]);
    throw new Error("unknown-device");
  }
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const { payload, sig } = JSON.parse(r.text) as { payload: string; sig: string };
  const p = await verifyLicense(payload, sig, LICENSE_PUBKEY);
  if (!p) throw new Error("bad-signature");
  await Promise.all([setSetting(K.payload, payload), setSetting(K.sig, sig), setSetting(K.code, p.code)]);
  return p;
}

/** Abonnement IPTV configuré par le revendeur pour ce client (vide si aucun ou licence inactive). null si injoignable. */
export async function fetchResellerSources(): Promise<ResellerSource[] | null> {
  const sec = await secret();
  if (!sec) return null;
  try {
    const r = await http({ url: `${LICENSE_URL}/api/lic/sources`, headers: { authorization: `Bearer ${sec}`, accept: "application/json" } });
    return r.status === 200 ? (JSON.parse(r.text) as { sources: ResellerSource[] }).sources : null;
  } catch { return null; }
}

export async function fetchInbox(): Promise<Announcement[]> {
  const sec = await secret();
  if (!sec) return [];
  try {
    const r = await http({ url: `${LICENSE_URL}/api/lic/inbox`, headers: { authorization: `Bearer ${sec}`, accept: "application/json" } });
    return r.status === 200 ? (JSON.parse(r.text) as { messages: Announcement[] }).messages : [];
  } catch { return []; }
}

export async function markAnnouncementsRead(ids: string[]): Promise<void> {
  const sec = await secret();
  if (!sec || !ids.length) return;
  try { await http({ url: `${LICENSE_URL}/api/lic/inbox/read`, method: "POST", headers: { ...JSON_H, authorization: `Bearer ${sec}` }, body: JSON.stringify({ ids }) }); } catch { /* réessayé à la prochaine ouverture */ }
}
