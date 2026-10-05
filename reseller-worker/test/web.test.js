import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../src/lib/crypto.js";
import { createReseller, setPassword, getReseller } from "../src/panel.js";

const ORIGIN = "https://reseller.test";
let ipN = 0;
const freshIp = () => { ipN++; return `192.0.${(ipN >> 8) & 255}.${ipN & 255}`; };

function req(path, { method = "GET", form, cookie, ip, origin = ORIGIN, json, token } = {}) {
  const h = new Headers({ "cf-connecting-ip": ip || freshIp() });
  if (cookie) h.set("cookie", cookie);
  if (origin && method !== "GET") h.set("origin", origin);
  if (token) h.set("authorization", `Bearer ${token}`);
  let body;
  if (form) { h.set("content-type", "application/x-www-form-urlencoded"); body = new URLSearchParams(form).toString(); }
  if (json !== undefined) { h.set("content-type", "application/json"); body = JSON.stringify(json); }
  return exports.default.fetch(new Request(ORIGIN + path, { method, headers: h, body, redirect: "manual" }));
}
const cookieOf = (res) => (res.headers.get("set-cookie") || "").match(/(__Host-utv_sess=[^;]+)/)?.[1] ?? null;
async function csrfOf(cookie, path = "/profile") {
  const html = await (await req(path, { cookie })).text();
  return html.match(/name="csrf" value="([^"]+)"/)?.[1];
}

let n = 0;
/** Compte prêt à l'emploi (mot de passe définitif), connecté. */
async function account(role = "reseller", { mustChange = false } = {}) {
  n++;
  const login = `${role}${n}t${Date.now() % 100000}`;
  const id = await createReseller(env.RESELLER, { login, name: `Nom <b>${n}</b>`, passwordHash: "x", role });
  await setPassword(env.RESELLER, id, await hashPassword("correct horse battery"), { mustChange });
  const res = await req("/login", { method: "POST", form: { login, password: "correct horse battery" } });
  return { id, login, cookie: cookieOf(res), res };
}

describe("connexion", () => {
  it("mauvais mot de passe : 401, pas de cookie", async () => {
    const { login } = await account();
    const res = await req("/login", { method: "POST", form: { login, password: "nope" } });
    expect(res.status).toBe(401);
    expect(cookieOf(res)).toBeNull();
  });

  it("revendeur connecté → tableau de bord ; non connecté → /login", async () => {
    const a = await account();
    expect(a.res.headers.get("location")).toBe("/");
    expect((await req("/", { cookie: a.cookie })).status).toBe(200);
    expect((await req("/")).headers.get("location")).toBe("/login");
  });

  it("mot de passe provisoire : tout redirige vers /password jusqu'au changement", async () => {
    const a = await account("reseller", { mustChange: true });
    expect((await req("/customers", { cookie: a.cookie })).headers.get("location")).toBe("/password");
    const csrf = await csrfOf(a.cookie, "/password");
    const res = await req("/password", { method: "POST", cookie: a.cookie, form: { csrf, current: "correct horse battery", next: "a much better passphrase" } });
    expect(res.status).toBe(302);
    const fresh = cookieOf(res);
    expect((await req("/customers", { cookie: fresh })).status).toBe(200);
    // L'ancienne session est morte (époque changée).
    expect((await req("/customers", { cookie: a.cookie })).headers.get("location")).toBe("/login");
  });

  it("revendeur suspendu : session coupée et connexion refusée", async () => {
    const a = await account();
    await env.RESELLER.prepare(`UPDATE reseller SET status = 'suspended', session_epoch = session_epoch + 1 WHERE id = ?`).bind(a.id).run();
    expect((await req("/", { cookie: a.cookie })).headers.get("location")).toBe("/login");
    expect((await req("/login", { method: "POST", form: { login: a.login, password: "correct horse battery" } })).status).toBe(401);
  });

  it("limite de tentatives par IP", async () => {
    const ip = freshIp();
    let last;
    for (let i = 0; i < 11; i++) last = await req("/login", { method: "POST", ip, form: { login: "x", password: "y" } });
    expect(last.status).toBe(429);
  });
});

describe("protections", () => {
  it("POST sans jeton CSRF ou d'une autre origine : 403", async () => {
    const a = await account();
    expect((await req("/profile", { method: "POST", cookie: a.cookie, form: { name: "x" } })).status).toBe(403);
    const csrf = await csrfOf(a.cookie);
    expect((await req("/profile", { method: "POST", cookie: a.cookie, origin: "https://evil.test", form: { csrf, name: "x" } })).status).toBe(403);
  });

  it("le texte saisi est échappé (pas d'injection HTML)", async () => {
    const a = await account();
    const html = await (await req("/", { cookie: a.cookie })).text();
    expect(html).toContain("Nom &lt;b&gt;");
    expect(html).not.toContain("Nom <b>");
    const res = await req("/", { cookie: a.cookie });
    expect(res.headers.get("content-security-policy")).toContain("script-src 'nonce-");
  });

  it("un revendeur ne voit pas les pages d'administration", async () => {
    const a = await account();
    expect((await req("/admin", { cookie: a.cookie })).status).toBe(404);
  });
});

describe("parcours revendeur", () => {
  it("contrat → crédits → activation d'un code → client visible → renouvellement", async () => {
    const admin = await account("admin");
    const rev = await account();
    // Sans contrat : activation renvoyée vers /agreement.
    let csrf = await csrfOf(rev.cookie);
    const reg = await (await req("/api/lic/register", { method: "POST", json: { platform: "android-tv" } })).json();
    expect((await req("/activate", { method: "POST", cookie: rev.cookie, form: { csrf, code: reg.code } })).headers.get("location")).toBe("/agreement");
    await req("/agreement", { method: "POST", cookie: rev.cookie, form: { csrf, accept: "1" } });
    // L'administrateur ajoute 2 crédits.
    const acsrf = await csrfOf(admin.cookie);
    await req(`/admin/resellers/${rev.id}/credits`, { method: "POST", cookie: admin.cookie, form: { csrf: acsrf, amount: "2", note: "virement 123" } });
    // Activation.
    csrf = await csrfOf(rev.cookie);
    const act = await req("/activate", { method: "POST", cookie: rev.cookie, form: { csrf, code: reg.code, label: "Ahmed" } });
    expect(decodeURIComponent(act.headers.get("location"))).toContain("ok=Device activated");
    const list = await (await req("/customers", { cookie: rev.cookie })).text();
    expect(list).toContain("Ahmed");
    const cid = list.match(/\/customers\/([0-9a-f-]{36})/)[1];
    await req(`/customers/${cid}/renew`, { method: "POST", cookie: rev.cookie, form: { csrf } });
    const page = await (await req(`/customers/${cid}`, { cookie: rev.cookie })).text();
    expect(page).toContain(reg.code);
    // Plus de crédit : message clair.
    const r2 = await req(`/customers/${cid}/renew`, { method: "POST", cookie: rev.cookie, form: { csrf } });
    expect(r2.headers.get("location")).toContain("e=no_credit");
    // L'appareil voit la licence active et le contact du revendeur.
    const st = await (await req("/api/lic/status", { token: reg.installSecret })).json();
    const payload = JSON.parse(atob(st.payload.replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.status).toBe("active");
  });

  it("annonce envoyée → reçue dans la boîte de l'appareil → marquée lue", async () => {
    const rev = await account();
    await env.RESELLER.prepare(`UPDATE reseller SET agreement_signed_at = ? WHERE id = ?`).bind(Date.now(), rev.id).run();
    await env.RESELLER.prepare(`INSERT INTO credit_ledger (reseller_id, delta, reason, created_at, created_by) VALUES (?, 5, 'purchase', ?, 'test')`).bind(rev.id, Date.now()).run();
    const reg = await (await req("/api/lic/register", { method: "POST", json: {} })).json();
    const csrf = await csrfOf(rev.cookie);
    await req("/activate", { method: "POST", cookie: rev.cookie, form: { csrf, code: reg.code } });
    await req("/messages", { method: "POST", cookie: rev.cookie, form: { csrf, title: "Maintenance <tonight>", body: "Servers restart at 23:00", target: "all", days: "7" } });
    const inbox = await (await req("/api/lic/inbox", { token: reg.installSecret })).json();
    expect(inbox.messages).toHaveLength(1);
    expect(inbox.messages[0]).toMatchObject({ title: "Maintenance <tonight>", read: false });
    await req("/api/lic/inbox/read", { method: "POST", token: reg.installSecret, json: { ids: [inbox.messages[0].id] } });
    expect((await (await req("/api/lic/inbox", { token: reg.installSecret })).json()).messages[0].read).toBe(true);
    expect((await req("/api/lic/inbox")).status).toBe(401);
  });

  it("profil : contact support renvoyé à l'app", async () => {
    const rev = await account();
    const csrf = await csrfOf(rev.cookie);
    await req("/profile", { method: "POST", cookie: rev.cookie, form: { csrf, name: "Basil TV", whatsapp: "+971 50 000 0000", telegram: "@basiltv", supportText: "24/7" } });
    const r = await getReseller(env.RESELLER, rev.id);
    expect(r).toMatchObject({ name: "Basil TV", support_whatsapp: "+971500000000", support_telegram: "basiltv", support_text: "24/7" });
  });
});

describe("administration", () => {
  it("création d'un revendeur : mot de passe provisoire affiché une fois, changement imposé", async () => {
    const admin = await account("admin");
    const csrf = await csrfOf(admin.cookie);
    const login = `basil${Date.now() % 100000}`;
    const html = await (await req("/admin/resellers", { method: "POST", cookie: admin.cookie, form: { csrf, login, name: "Basil" } })).text();
    const pwd = html.match(/class="secret">([^<]+)</)[1];
    expect(pwd.length).toBe(16);
    const res = await req("/login", { method: "POST", form: { login, password: pwd } });
    expect((await req("/", { cookie: cookieOf(res) })).headers.get("location")).toBe("/password");
    // Identifiant déjà pris.
    expect((await req("/admin/resellers", { method: "POST", cookie: admin.cookie, form: { csrf, login, name: "x" } })).headers.get("location")).toContain("e=login_taken");
  });

  it("page de téléchargement publique", async () => {
    const html = await (await req("/download")).text();
    expect(html).toContain("UltraTVPro-arm64-v8a.apk");
  });
});
