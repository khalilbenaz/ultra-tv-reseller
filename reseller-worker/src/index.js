// Worker « ultratv-reseller » : licences de la variante revendeur de l'application, panneau revendeur, annonces.
// Séparé du Worker public (ultratv-config) : isolation des pannes et du périmètre juridique ; déplaçable tel quel
// vers un autre compte Cloudflare. Les briques communes (chiffrement, nettoyage, HTTP, Guard) sont partagées.

import { Guard } from "../../cloudflare-config/src/guard.js";
import { clientIp, json, parseBearer, readJson, tooMany, withSecurityHeaders } from "../../cloudflare-config/src/http.js";
import { loadDeviceContext, registerDevice, signPayload, statusPayload, touchDevice, unreadCount } from "./license.js";

export { Guard };

const guard = (env, name) => env.GUARD.get(env.GUARD.idFromName(name));
async function limited(env, key, limit, windowSec) {
  const r = await guard(env, key).hit(limit, windowSec);
  return r.ok ? null : tooMany(r.retryAfter, true);
}

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const m = req.method;
  if (m === "OPTIONS") return new Response(null, { status: 204 });

  // ---- API application (variante revendeur) ----
  if (path === "/api/lic/register" && m === "POST") return licRegister(req, env);
  if (path === "/api/lic/status" && m === "GET") return licStatus(req, env, url);

  if (path === "/health") return json({ ok: true });
  return json({ error: "not_found" }, 404);
}

/** Premier lancement : appareil + essai. Limité par IP (une box qui se réinstalle en boucle ne remplit pas la base). */
async function licRegister(req, env) {
  const rl = await limited(env, `licreg:ip:${clientIp(req)}`, 20, 3600);
  if (rl) return rl;
  const body = await readJson(req, 2048);
  if (body.error) return body.error;
  const r = await registerDevice(env.RESELLER, body.value);
  return json(r, 201);
}

/** Statut signé de l'appareil. Authentification : secret d'installation en Bearer. */
async function licStatus(req, env, url) {
  const rl = await limited(env, `licstatus:ip:${clientIp(req)}`, 240, 600);
  if (rl) return rl;
  const ctx = await loadDeviceContext(env.RESELLER, parseBearer(req));
  if (!ctx) return json({ error: "unknown_device" }, 401);
  await touchDevice(env.RESELLER, ctx.device, url.searchParams.get("v"));
  const signed = await signPayload(env, statusPayload(ctx, await unreadCount(env.RESELLER, ctx)));
  if (!signed) return json({ error: "server_misconfigured" }, 500);
  return json(signed, 200, { "cache-control": "no-store" });
}

export default {
  async fetch(req, env) {
    try {
      return withSecurityHeaders(await route(req, env));
    } catch (err) {
      console.error("erreur:", err?.message);
      return withSecurityHeaders(json({ error: "internal" }, 500));
    }
  },
};
