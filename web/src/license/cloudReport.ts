// Édition Pro : transmet au tableau de bord du compte le dernier statut de licence signé par le panneau revendeur.
// { payload, sig } partent TELS QUELS (jamais re-signés) : le Worker de configuration les vérifie avec la clé publique Pro,
// refuse un statut de plus de 8 jours et limite à 20 envois par heure et par appareil. On n'envoie donc que si le statut
// a changé (autre signature) ou si le dernier envoi date de plus de 24 h.

import { getSetting, setSetting } from "@/db/db";
import { postLicense } from "@/cloud/client";
import { IS_PRO } from "@/edition";
import { signedLicense } from "./client";

export const LICENSE_REPORT_EVERY_MS = 24 * 3600_000;
const K = { sig: "lic.cloudSig", at: "lic.cloudAt" };

/** Envoi nécessaire : nouveau statut, dernier envoi de plus de 24 h, ou horloge reculée depuis. */
export function licenseReportDue(lastSig: string, lastAt: number, sig: string, now: number): boolean {
  if (!sig) return false;
  return sig !== lastSig || now < lastAt || now - lastAt >= LICENSE_REPORT_EVERY_MS;
}

/** Envoie le statut si nécessaire ; `true` s'il est parti. Lève sur erreur réseau (l'appelant l'ignore). */
export async function reportLicenseToCloud(base: string, token: string, now = Date.now()): Promise<boolean> {
  if (!IS_PRO) return false;
  const s = await signedLicense();
  if (!s) return false;
  const [lastSig, lastAt] = await Promise.all([getSetting<string>(K.sig, ""), getSetting<number>(K.at, 0)]);
  if (!licenseReportDue(lastSig, lastAt, s.sig, now)) return false;
  await postLicense(base, token, s.payload, s.sig);
  await Promise.all([setSetting(K.sig, s.sig), setSetting(K.at, now)]);
  return true;
}
