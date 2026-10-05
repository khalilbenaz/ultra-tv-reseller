// Édition de l'application : « standard » (publique, gratuite) ou « pro » (variante revendeur avec licence).
// Fixée à la compilation : VITE_EDITION=pro npm run build.

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const EDITION: "standard" | "pro" = env.VITE_EDITION === "pro" ? "pro" : "standard";
export const IS_PRO = EDITION === "pro";
export const LICENSE_URL = (env.VITE_LICENSE_URL || "https://ultratv-reseller.khalilbenaz.workers.dev").replace(/\/+$/, "");
/** Clé publique Ed25519 (SPKI base64) qui vérifie les statuts signés par le Worker revendeur. */
export const LICENSE_PUBKEY = "MCowBQYDK2VwAyEAct7h7rfzeaA4nLuL2k0R14nTdc/IrzxStqx8+jdnF4M=";
