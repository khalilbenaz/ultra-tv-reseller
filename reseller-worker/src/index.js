// Worker « ultratv-reseller » : licences de la variante revendeur de l'application (Ultra TV Pro), panneau revendeur,
// annonces. Entièrement indépendant du Worker public (ultratv-config) : son propre code, sa base D1, ses secrets,
// son adresse ; déplaçable tel quel vers un autre compte Cloudflare.

import { Guard } from "./lib/guard.js";
import {
  clearCookieHeader, clientIp, COOKIE, csrfToken, json, nonce, parseBearer, readCookie, readForm, readJson, redirect,
  sameOrigin, sessionCookieHeader, signSession, tooMany, verifySession, withSecurityHeaders,
} from "./lib/http.js";
import { hashPassword, randomToken, timingSafeEqual, verifyPassword } from "./lib/crypto.js";
import { loadDeviceContext, registerDevice, signPayload, statusPayload, touchDevice, unreadCount } from "./license.js";
import * as P from "./panel.js";
import * as V from "./pages.js";

export { Guard };

const guard = (env, name) => env.GUARD.get(env.GUARD.idFromName(name));
async function limited(env, key, limit, windowSec, asJson = true) {
  const r = await guard(env, key).hit(limit, windowSec);
  return r.ok ? null : tooMany(r.retryAfter, asJson);
}

/** Réponse HTML avec CSP stricte : scripts et feuilles de style par nonce ; seuls les attributs style sont permis. */
function html(body, n, status = 200, headers = {}) {
  const csp = [
    "default-src 'none'", `script-src 'nonce-${n}'`, `style-src 'nonce-${n}'`, "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:", "form-action 'self'", "base-uri 'none'", "frame-ancestors 'none'",
  ].join("; ");
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": csp, "cache-control": "no-store", ...headers } });
}

function sessionSecret(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET manquant");
  return env.SESSION_SECRET;
}

/** Utilisateur connecté (revendeur ou administrateur) ou null. Session invalidée par changement d'époque. */
async function currentUser(req, env) {
  const s = await verifySession(sessionSecret(env), readCookie(req, COOKIE));
  if (!s) return null;
  const r = await P.resellerByLogin(env.RESELLER, s.login);
  if (!r || (r.session_epoch ?? 0) !== s.epoch) return null;
  if (r.role !== "admin" && r.status !== "active") return null;
  // Sous-revendeur d'un distributeur suspendu : plus d'accès au panneau.
  if (r.parent_id && (await P.getReseller(env.RESELLER, r.parent_id))?.status !== "active") return null;
  return { ...r, csrf: await csrfToken(sessionSecret(env), s.sid) };
}

const DOWNLOADS_REPO = "khalilbenaz/ultra-tv-pro";

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const m = req.method;
  if (m === "OPTIONS") return new Response(null, { status: 204 });

  // ---- API application (Ultra TV Pro) ----
  if (path === "/api/lic/register" && m === "POST") return licRegister(req, env);
  if (path === "/api/lic/status" && m === "GET") return licStatus(req, env, url);
  if (path === "/api/lic/inbox" && m === "GET") return licInbox(req, env);
  if (path === "/api/lic/inbox/read" && m === "POST") return licInboxRead(req, env);

  if (path === "/health") return json({ ok: true });
  if (path === "/download" && m === "GET") return downloadPage();

  // ---- panneau ----
  if (path === "/login" && m === "GET") { const n = nonce(); return html(V.loginPage(n), n); }
  if (path === "/login" && m === "POST") return doLogin(req, env);

  const me = await currentUser(req, env);
  if (!me) return m === "GET" ? redirect("/login") : json({ error: "unauthorized" }, 401);

  let form = null;
  if (m === "POST") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    const fr = await readForm(req);
    if (fr.error) return fr.error;
    form = fr.form;
    if (!timingSafeEqual(form.get("csrf") || "", me.csrf)) return json({ error: "csrf" }, 403);
    if (path === "/logout") return redirect("/login", { "set-cookie": clearCookieHeader() });
  }

  // Mot de passe provisoire : à changer avant toute autre chose.
  if (path === "/password") return m === "POST" ? doPassword(env, me, form) : view(V.passwordPage, me, { forced: !!me.must_change_password });
  if (me.must_change_password) return redirect("/password");

  if (me.role === "admin") return adminRoute(env, me, path, m, form, url);
  return resellerRoute(env, me, path, m, form, url);
}

function view(fn, me, data, status = 200) {
  const n = nonce();
  return html(fn(n, me, data), n, status);
}
const flashOf = (url) => {
  const ok = url.searchParams.get("ok"), e = url.searchParams.get("e");
  return ok ? { ok: true, text: ok } : e ? { ok: false, text: V.ERRORS[e] || e } : null;
};
const back = (to, { ok, e } = {}) => redirect(`${to}${to.includes("?") ? "&" : "?"}${ok ? `ok=${encodeURIComponent(ok)}` : `e=${encodeURIComponent(e)}`}`);
async function attempt(to, okText, fn) {
  try { await fn(); return back(to, { ok: okText }); }
  catch (e) { if (e instanceof P.PanelError) return back(to, { e: e.code }); throw e; }
}

async function resellerRoute(env, me, path, m, form, url) {
  const db = env.RESELLER;
  const flash = flashOf(url);
  if (path === "/agreement") {
    if (m === "POST") { if (form.get("accept") !== "1") return redirect("/agreement"); await P.acceptAgreement(db, me.id); return back("/", { ok: "Agreement accepted. You can now activate devices." }); }
    return view(V.agreementPage, me, {});
  }
  // Contrat pas encore accepté : le tableau de bord mène d'abord au contrat (il ne peut rien activer sans).
  if (path === "/" && m === "GET" && !me.agreement_signed_at) return redirect("/agreement");
  if (path === "/" && m === "GET") {
    const [stats, customers] = await Promise.all([P.dashboardStats(db, me.id), P.listCustomers(db, me.id)]);
    return view(V.dashboardPage, me, { stats, customers, flash, agreementMissing: !me.agreement_signed_at });
  }
  if (path === "/activate" && m === "POST") {
    if (!me.agreement_signed_at) return redirect("/agreement");
    const customerId = form.get("customer") || null;
    const to = customerId ? `/customers/${encodeURIComponent(customerId)}` : "/";
    return attempt(to, customerId ? "Device added." : "Device activated for one year.", () =>
      P.activate(db, me.id, { code: form.get("code"), customerId, label: form.get("label") }, me.login));
  }
  if (path === "/activate-bulk" && m === "POST") {
    if (!me.agreement_signed_at) return redirect("/agreement");
    return view(V.bulkResultPage, me, { results: await P.activateMany(db, me.id, form.get("codes"), me.login) });
  }
  if (path === "/extend-trial" && m === "POST") return attempt("/", "Free trial extended by 7 days.", () => P.extendTrial(db, me.id, form.get("code")));
  if (path === "/export/customers.csv" && m === "GET") return csvResponse(await P.customersCsv(db, me.id), "customers.csv");
  if (path === "/export/ledger.csv" && m === "GET") return csvResponse(await P.ledgerCsv(db, me.id), "credit-history.csv");
  if (me.is_distributor === 1 && path.startsWith("/network")) return networkRoute(env, me, path, m, form, url);
  if (path === "/customers" && m === "GET") {
    const q = url.searchParams.get("q") || "";
    return view(V.customersPage, me, { customers: await P.listCustomers(db, me.id, q), q, flash });
  }
  const cm = path.match(/^\/customers\/([0-9a-f-]{36})(?:\/(renew|suspend|resume|label)|\/devices\/([0-9a-f-]{36})\/detach)?$/);
  if (cm) {
    const [, cid, action, did] = cm;
    const to = `/customers/${cid}`;
    if (m === "GET" && !action && !did) {
      try { return view(V.customerPage, me, { detail: await P.customerDetail(db, me.id, cid), flash }); }
      catch (e) { if (e instanceof P.PanelError) return redirect("/customers"); throw e; }
    }
    if (m === "POST" && did) return attempt(to, "Device detached.", () => P.detachDevice(db, me.id, did));
    if (m === "POST" && action === "renew") return attempt(to, "License renewed for one year.", () => P.renew(db, me.id, cid, me.login));
    if (m === "POST" && action === "suspend") return attempt(to, "Customer suspended.", () => P.setCustomerSuspended(db, me.id, cid, true));
    if (m === "POST" && action === "resume") return attempt(to, "Customer resumed.", () => P.setCustomerSuspended(db, me.id, cid, false));
    if (m === "POST" && action === "label") return attempt(to, "Saved.", () => P.setCustomerLabel(db, me.id, cid, form.get("label"), form.get("note")));
  }
  if (path === "/messages") {
    if (m === "POST") return attempt("/messages", "Announcement sent.", () => P.createMessage(db, me.id, { target: form.get("target"), title: form.get("title"), body: form.get("body"), days: form.get("days") }));
    const [messages, customers] = await Promise.all([P.listMessages(db, me.id), P.listCustomers(db, me.id)]);
    return view(V.messagesPage, me, { messages, customers, flash });
  }
  const dm = path.match(/^\/messages\/([0-9a-f-]{36})\/delete$/);
  if (dm && m === "POST") return attempt("/messages", "Deleted.", () => P.deleteMessage(db, me.id, dm[1]));
  if (path === "/profile") {
    if (m === "POST") return attempt("/profile", "Profile saved.", () => P.updateProfile(db, me.id, { name: form.get("name"), whatsapp: form.get("whatsapp"), telegram: form.get("telegram"), supportText: form.get("supportText") }));
    return view(V.profilePage, me, { r: me, flash });
  }
  return json({ error: "not_found" }, 404);
}

function csvResponse(body, name) {
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}

/** Réseau du distributeur : sous-revendeurs, transferts, reprises, suspension, mot de passe. */
async function networkRoute(env, me, path, m, form, url) {
  const db = env.RESELLER;
  const flash = flashOf(url);
  if (path === "/network") {
    if (m === "POST") {
      const password = tempPassword();
      try {
        await P.createSubReseller(db, me.id, { login: form.get("login"), name: form.get("name"), passwordHash: await hashPassword(password) });
      } catch (e) { if (e instanceof P.PanelError) return back("/network", { e: e.code }); throw e; }
      return view(V.networkPage, me, { stats: await P.networkStats(db, me.id), subs: await P.listSubResellers(db, me.id), created: { login: String(form.get("login")).trim().toLowerCase(), password } });
    }
    return view(V.networkPage, me, { stats: await P.networkStats(db, me.id), subs: await P.listSubResellers(db, me.id), flash });
  }
  const nm = path.match(/^\/network\/([0-9a-f-]{36})(?:\/(transfer|reclaim|status|reset-password))?$/);
  if (!nm) return json({ error: "not_found" }, 404);
  const [, sid, action] = nm;
  let r;
  try { r = await P.getSub(db, me.id, sid); } catch { return redirect("/network"); }
  const to = `/network/${sid}`;
  const show = async (extra = {}) => view(V.subResellerPage, me, { r: await P.getReseller(db, sid), bal: await P.balance(db, sid), myBal: await P.balance(db, me.id), entries: await P.ledger(db, sid), flash, ...extra });
  if (m === "GET" && !action) return show();
  if (m === "POST" && action === "transfer") return attempt(to, "Credits transferred.", () => P.transferCredits(db, me.id, sid, form.get("amount"), me.login));
  if (m === "POST" && action === "reclaim") return attempt(to, "Credits taken back.", () => P.reclaimCredits(db, me.id, sid, form.get("amount"), me.login));
  if (m === "POST" && action === "status") return attempt(to, "Status updated.", () => P.setSubStatus(db, me.id, sid, form.get("status")));
  if (m === "POST" && action === "reset-password") {
    const password = tempPassword();
    await P.setPassword(db, r.id, await hashPassword(password), { mustChange: true });
    return show({ password });
  }
  return json({ error: "not_found" }, 404);
}

async function adminRoute(env, me, path, m, form, url) {
  const db = env.RESELLER;
  const flash = flashOf(url);
  if (path === "/" || path === "/admin") {
    if (m !== "GET") return json({ error: "not_found" }, 404);
    return view(V.adminPage, me, { resellers: await P.listResellers(db), flash });
  }
  if (path === "/admin/resellers" && m === "POST") {
    const password = tempPassword();
    try {
      await P.createReseller(db, { login: form.get("login"), name: form.get("name"), passwordHash: await hashPassword(password), isDistributor: form.get("distributor") === "1" });
    } catch (e) { if (e instanceof P.PanelError) return back("/admin", { e: e.code }); throw e; }
    return view(V.adminPage, me, { resellers: await P.listResellers(db), created: { login: String(form.get("login")).trim().toLowerCase(), password } });
  }
  const am = path.match(/^\/admin\/resellers\/([0-9a-f-]{36})(?:\/(credits|status|reset-password|distributor))?$/);
  if (am) {
    const [, rid, action] = am;
    const r = await P.getReseller(db, rid);
    if (!r || r.role !== "reseller") return redirect("/admin");
    const to = `/admin/resellers/${rid}`;
    const show = async (extra = {}) => view(V.adminResellerPage, me, { r: await P.getReseller(db, rid), bal: await P.balance(db, rid), entries: await P.ledger(db, rid), flash, ...extra });
    if (m === "GET" && !action) return show();
    if (m === "POST" && action === "credits") return attempt(to, "Crédits enregistrés.", () => P.addCredits(db, rid, form.get("amount"), form.get("note"), me.login));
    if (m === "POST" && action === "status") return attempt(to, "Statut mis à jour.", () => P.setResellerStatus(db, rid, form.get("status")));
    if (m === "POST" && action === "distributor") return attempt(to, "Statut distributeur mis à jour.", () => P.setDistributor(db, rid, form.get("on") === "1"));
    if (m === "POST" && action === "reset-password") {
      const password = tempPassword();
      await P.setPassword(db, rid, await hashPassword(password), { mustChange: true });
      return show({ password });
    }
  }
  if (path === "/profile" && m === "GET") return view(V.profilePage, me, { r: me, flash });
  return json({ error: "not_found" }, 404);
}

/** Mot de passe provisoire lisible (16 caractères, ~80 bits). */
function tempPassword() {
  return randomToken(12).replace(/[-_]/g, "x").slice(0, 16);
}

async function doLogin(req, env) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const ip = clientIp(req);
  const rl = await limited(env, `login:ip:${ip}`, 10, 900, false);
  if (rl) return rl;
  const fr = await readForm(req);
  if (fr.error) return fr.error;
  const form = fr.form;
  const login = String(form.get("login") ?? "").trim().toLowerCase().slice(0, 64);
  const rlu = await limited(env, `login:user:${login}`, 20, 3600, false);
  if (rlu) return rlu;
  const r = login ? await P.resellerByLogin(env.RESELLER, login) : null;
  const { ok } = await verifyPassword(r ? { passwordHash: r.password_hash } : null, String(form.get("password") ?? ""));
  if (!r || !ok || (r.role !== "admin" && r.status !== "active")) {
    const n = nonce();
    return html(V.loginPage(n, r && ok ? "This account is suspended." : "Wrong login or password."), n, 401);
  }
  const cookie = await signSession(sessionSecret(env), { login: r.login, epoch: r.session_epoch ?? 0 });
  return redirect(r.role === "admin" ? "/admin" : "/", { "set-cookie": sessionCookieHeader(cookie) });
}

async function doPassword(env, me, form) {
  const cur = String(form.get("current") ?? ""), next = String(form.get("next") ?? "");
  const n = nonce();
  const fail = (error) => html(V.passwordPage(n, me, { forced: !!me.must_change_password, error }), n, 400);
  if (!(await verifyPassword({ passwordHash: me.password_hash }, cur)).ok) return fail(me.role === "admin" ? "Mot de passe actuel incorrect." : "Current password is wrong.");
  if (next.length < 10 || next.length > 200 || next === cur) return fail(me.role === "admin" ? "Nouveau mot de passe trop court ou identique." : "New password too short or unchanged.");
  await P.setPassword(env.RESELLER, me.id, await hashPassword(next));
  // L'époque a changé : nouvelle session pour rester connecté.
  const cookie = await signSession(sessionSecret(env), { login: me.login, epoch: (me.session_epoch ?? 0) + 1 });
  return redirect(me.role === "admin" ? "/admin" : "/", { "set-cookie": sessionCookieHeader(cookie) });
}

function downloadPage() {
  const rel = `https://github.com/${DOWNLOADS_REPO}/releases/latest/download`;
  const links = [
    { label: "Android TV / Google TV (arm64)", url: `${rel}/UltraTVPro-arm64-v8a.apk`, primary: true },
    { label: "Android (older boxes, armeabi-v7a)", url: `${rel}/UltraTVPro-armeabi-v7a.apk` },
    { label: "Windows", url: `${rel}/UltraTVPro-win-x64.exe` },
    { label: "macOS", url: `${rel}/UltraTVPro-mac-universal.dmg` },
    { label: "Linux (AppImage)", url: `${rel}/UltraTVPro-linux-x86_64.AppImage` },
  ];
  const n = nonce();
  return html(V.downloadPage(n, links), n, 200, { "cache-control": "public, max-age=300" });
}

// ---- API appareil ----

async function licRegister(req, env) {
  const rl = await limited(env, `licreg:ip:${clientIp(req)}`, 20, 3600);
  if (rl) return rl;
  const body = await readJson(req, 2048);
  if (body.error) return body.error;
  return json(await registerDevice(env.RESELLER, body.value), 201);
}

async function deviceCtx(req, env, limit) {
  const rl = await limited(env, `licdev:ip:${clientIp(req)}`, limit, 600);
  if (rl) return { error: rl };
  const ctx = await loadDeviceContext(env.RESELLER, parseBearer(req));
  return ctx ? { ctx } : { error: json({ error: "unknown_device" }, 401) };
}

async function licStatus(req, env, url) {
  const { ctx, error } = await deviceCtx(req, env, 240);
  if (error) return error;
  await touchDevice(env.RESELLER, ctx.device, url.searchParams.get("v"));
  const signed = await signPayload(env, statusPayload(ctx, await unreadCount(env.RESELLER, ctx)));
  if (!signed) return json({ error: "server_misconfigured" }, 500);
  return json(signed, 200, { "cache-control": "no-store" });
}

async function licInbox(req, env) {
  const { ctx, error } = await deviceCtx(req, env, 240);
  if (error) return error;
  return json({ messages: await P.inboxFor(env.RESELLER, ctx) }, 200, { "cache-control": "no-store" });
}

async function licInboxRead(req, env) {
  const { ctx, error } = await deviceCtx(req, env, 240);
  if (error) return error;
  const body = await readJson(req, 8192);
  if (body.error) return body.error;
  return json({ marked: await P.markRead(env.RESELLER, ctx, body.value.ids) });
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
