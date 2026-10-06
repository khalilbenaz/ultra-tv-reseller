// Pages HTML du panneau (rendu serveur, aucune dépendance, CSP stricte avec nonce).
// Panneau revendeur en anglais (revendeurs internationaux), administration en français.
// TOUT texte venant de la base passe par esc().

import { escapeHtml as esc } from "./lib/http.js";
import { AGREEMENT_VERSION } from "./panel.js";

const fmtDate = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "—");
const fmtDateTime = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");

const CSS = `
:root{--bg:#0a0a0c;--side:#0e0e11;--surface:#141418;--s2:#1a1a1f;--field:#0e0e11;--text:#f2f2f3;--t2:#a1a1aa;--t3:#71717a;--accent:#d91e2b;--ok:#4ade80;--warn:#fbbf5c;--line:#1e1e22;--line2:#2a2a30;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 Manrope,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
a{color:inherit}h1,h2,.brand b,.stat b{font-family:Sora,Manrope,system-ui,sans-serif}
.shell{display:flex;min-height:100vh}
.side{width:248px;flex:none;background:var(--side);border-right:1px solid var(--line);padding:26px 16px;display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;padding:2px 10px 22px}.brand i{width:34px;height:34px;border-radius:10px;background:var(--accent);display:flex;align-items:center;justify-content:center}
.brand i svg{width:18px;height:18px}.brand b{display:block;font-size:16px;letter-spacing:.04em;line-height:1.1}.brand small{display:block;font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.18em}
.side nav{display:flex;flex-direction:column;gap:4px;flex:1}.side nav a{padding:11px 12px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;color:var(--t2)}
.side nav a.on{background:var(--s2);color:var(--text);box-shadow:inset 3px 0 0 var(--accent)}.side nav a:hover{color:var(--text);background:var(--s2)}
.side .who{border-top:1px solid var(--line);padding:14px 10px 0;display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--t2)}.side .who b{color:var(--text);font-size:14px}
.side .who button{width:100%}
main{flex:1;min-width:0;max-width:1180px;padding:36px 44px 64px}
h1{font-size:30px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em}h2{font-size:19px;font-weight:600;margin:32px 0 12px}.sub{color:var(--t2);margin:0 0 22px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.stat{display:flex;flex-direction:column-reverse;gap:6px}.stat b{display:block;font-size:34px;font-weight:700;line-height:1.1}.stat span{color:var(--t2);font-size:13px;font-weight:600}
.grid .stat:first-child{background:linear-gradient(135deg,var(--accent),#8f1019);border-color:transparent}.grid .stat:first-child span{color:#ffd9dc}
form.inline{display:flex;gap:12px;flex-wrap:wrap;align-items:end}label{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:600;color:#d4d4d8}
input,select,textarea{font:inherit;font-size:14px;padding:11px 12px;min-height:44px;border-radius:10px;border:1px solid var(--line2);background:var(--field);color:var(--text);min-width:0}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}::placeholder{color:var(--t3)}
textarea{min-height:110px;width:100%}input.code{font:700 19px ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;width:13ch}
button,.btn{font:inherit;font-size:14px;font-weight:700;padding:11px 18px;min-height:44px;border-radius:10px;border:0;background:var(--accent);color:#fff;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
button:hover,.btn:hover{filter:brightness(1.1)}button:focus-visible,.btn:focus-visible,a:focus-visible{outline:2px solid var(--text);outline-offset:2px}
button.ghost,.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line2)}button.ghost:hover,.btn.ghost:hover{background:var(--s2);filter:none}button.danger{background:var(--accent);color:#fff}
table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:18px;overflow:hidden;border:1px solid var(--line)}
th,td{text-align:left;padding:13px 16px;border-bottom:1px solid var(--line);font-size:14px;vertical-align:middle}th{color:var(--t3);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.1em}
tr:last-child td{border-bottom:0}tr:hover td{background:#17171c}.mono{font-family:ui-monospace,Menlo,monospace}.muted{color:var(--t2)}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:var(--s2);color:var(--t2)}
.pill.active{background:#1f3a2a;color:var(--ok)}.pill.expired,.pill.suspended{background:#3a1216;color:#ff6b75}.pill.soon{background:#3a2a10;color:var(--warn)}
.flash{padding:13px 16px;border-radius:12px;margin:0 0 18px;font-weight:600;border:1px solid}.flash.ok{background:#0f1a14;border-color:#1f3a2a;color:var(--ok)}.flash.err{background:#1f0e10;border-color:#3a1216;color:#ff8a92}
.secret{font:700 18px ui-monospace,Menlo,monospace;background:var(--bg);border:1px solid var(--line2);padding:10px 14px;border-radius:10px;display:inline-block;user-select:all;letter-spacing:.05em}
.creds{background:#0f1a14;border-color:#1f3a2a}.creds table{background:transparent;border:0;margin:12px 0}.creds th{width:220px}.creds tr:hover td{background:transparent}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(900px 500px at 50% -10%,#2a0a0e,transparent)}.center .card{width:100%;max-width:420px;padding:30px}
.center .brand{padding:0 0 18px}.center form{display:flex;flex-direction:column;gap:14px}.agreement{max-height:52vh;overflow:auto;background:var(--bg);border-radius:12px;padding:4px 20px;border:1px solid var(--line)}
.agreement h2{font-size:16px;margin:20px 0 6px}.agreement p{color:#d4d4d8}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.check{display:flex;flex-direction:row;align-items:center;gap:10px;min-height:44px;color:var(--text);font-size:14px;font-weight:600;cursor:pointer}
.check input{width:18px;height:18px;min-height:0;margin:0;accent-color:var(--accent)}form.inline .check{align-self:flex-end}
.acts{display:flex;flex-direction:column;gap:2px;padding:6px 22px}.act{display:grid;grid-template-columns:minmax(240px,auto) 1fr;gap:18px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}
.act:last-child{border-bottom:0}.act form{margin:0}.act button{width:100%}.act .muted{font-size:13px}
.stepper{display:inline-flex;align-items:stretch;border:1px solid var(--line2);border-radius:10px;overflow:hidden;width:max-content}
.stepper button{background:var(--field);color:var(--text);border-radius:0;min-width:44px;padding:0;font-size:18px}.stepper button:hover{background:var(--s2);filter:none}
.stepper input{width:58px;text-align:center;border:0;border-left:1px solid var(--line2);border-right:1px solid var(--line2);border-radius:0;font-weight:700;font-size:16px;-moz-appearance:textfield}
.stepper input::-webkit-inner-spin-button,.stepper input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.chips{display:flex;gap:8px;flex-wrap:wrap;border:0;margin:0;padding:0}.chips legend{font-size:13px;font-weight:600;color:#d4d4d8;padding:0 0 8px}
.chips label{flex-direction:row;cursor:pointer}.chips input{position:absolute;opacity:0;width:1px;height:1px}
.chips span{padding:9px 15px;border-radius:999px;border:1px solid var(--line2);color:#d4d4d8;font-weight:700;font-size:13px}
.chips input:checked+span{background:var(--text);color:var(--bg);border-color:var(--text)}.chips input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.compose{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px;align-items:start}
.tv{background:#050506;border:1px solid var(--line);border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:14px}
.tv-head{display:flex;justify-content:space-between;align-items:center}.tv-head b{font-family:Sora,sans-serif;font-size:18px}
.tv-new{padding:3px 9px;border-radius:999px;background:var(--accent);color:#fff;font-size:12px;font-weight:700}
.tv article{padding:16px;border-radius:12px;background:var(--surface);border:2px solid var(--text);display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}
.tv article.dim{border:1px solid var(--line)}.tv .tag{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.tv .tag.info{color:#ff6b75}.tv .tag.maintenance{color:var(--warn)}.tv .tag.promo{color:var(--ok)}.tv p{margin:0;font-size:14px;color:#d4d4d8;white-space:pre-line}
.cat{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.cat.info{background:#3a1216;color:#ff6b75}.cat.maintenance{background:#3a2a10;color:var(--warn)}.cat.promo{background:#1f3a2a;color:var(--ok)}
.btn.wa{background:#1f3a2a;color:var(--ok)}
@media (max-width:860px){.compose{grid-template-columns:1fr}}
@media (max-width:860px){.shell{flex-direction:column}.side{width:auto;height:auto;position:static;padding:14px 16px;border-right:0;border-bottom:1px solid var(--line)}
.brand{padding:0 0 10px}.side nav{flex-direction:row;flex-wrap:wrap}.side nav a{padding:8px 12px}.side .who{flex-direction:row;align-items:center;justify-content:space-between;padding-top:10px}.side .who button{width:auto}
main{padding:24px 16px 56px}table{display:block;overflow-x:auto}}
@media (max-width:640px){.act{grid-template-columns:1fr;gap:6px}}
`;

const JS = `
document.addEventListener("click", (e) => {
  const step = e.target.closest("[data-step]");
  if (step) {
    const i = step.parentElement.querySelector("input"), d = Number(step.dataset.step);
    const v = Math.min(Number(i.max) || 99, Math.max(Number(i.min) || 1, (Number(i.value) || 0) + d));
    i.value = String(v); i.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const cp = e.target.closest("[data-copy]");
  if (cp) {
    const t = document.getElementById(cp.dataset.copy), label = cp.textContent;
    navigator.clipboard.writeText(t.value).then(() => { cp.textContent = cp.dataset.done; setTimeout(() => { cp.textContent = label; }, 2000); }, () => { t.select(); });
  }
});
const pv = document.querySelector("[data-preview]");
if (pv) {
  const f = pv.closest("form") || document, out = (k) => document.querySelector("[data-pv=" + k + "]");
  const tags = JSON.parse(pv.dataset.preview);
  const render = () => {
    const c = (f.querySelector("[name=category]:checked") || {}).value || "info";
    out("title").textContent = f.querySelector("[name=title]").value || out("title").dataset.empty;
    out("body").textContent = f.querySelector("[name=body]").value || out("body").dataset.empty;
    out("tag").textContent = tags[c]; out("tag").className = "tag " + c;
  };
  f.addEventListener("input", render); f.addEventListener("change", render); render();
}
`;

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M10 9l5 2.5-5 2.5z"/></svg>`;
const FONTS = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@600;700&display=swap">`;
const brand = (tag) => `<div class="brand"><i>${LOGO}</i><div><b>ULTRA TV</b><small>${tag}</small></div></div>`;

function page(n, title, body, { me = null, nav = "", flash = null } = {}) {
  const admin = me?.role === "admin";
  const links = !me ? "" : admin
    ? [["/admin", "Revendeurs", "admin"], ["/profile", "Mon compte", "profile"]]
    : [["/", "Dashboard", "home"], ["/customers", "Customers", "customers"], ...(me.is_distributor === 1 ? [["/network", "Network", "network"]] : []),
       ["/messages", "Announcements", "messages"], ["/profile", "Profile", "profile"]];
  const side = me ? `<aside class="side">${brand(admin ? "ADMINISTRATION" : "PRO · RESELLER")}<nav aria-label="${admin ? "Navigation" : "Main"}">${links.map(([h, l, k]) => `<a href="${h}" class="${k === nav ? "on" : ""}"${k === nav ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
    <div class="who"><b>${esc(me.name)}</b><form method="post" action="/logout"><input type="hidden" name="csrf" value="${esc(me.csrf)}"><button class="ghost">${admin ? "Déconnexion" : "Log out"}</button></form></div></aside>` : "";
  const fl = flash ? `<div class="flash ${flash.ok ? "ok" : "err"}">${esc(flash.text)}</div>` : "";
  return `<!doctype html><html lang="${admin ? "fr" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="theme-color" content="#0a0a0c"><title>${esc(title)} · Ultra TV Pro</title>${FONTS}<style nonce="${n}">${CSS}</style></head><body>${me ? `<div class="shell">${side}<main>${fl}${body}</main></div>` : body}<script nonce="${n}">${JS}</script></body></html>`;
}

const csrf = (me) => `<input type="hidden" name="csrf" value="${esc(me.csrf)}">`;

function iptvFields(cur) {
  return `<label>Type<select name="kind"><option value="xtream"${cur?.kind === "m3u" ? "" : " selected"}>Xtream Codes</option><option value="m3u"${cur?.kind === "m3u" ? " selected" : ""}>M3U link</option></select></label>
  <label>Name shown in the app<input name="name" maxlength="60" value="${esc(cur?.name || "")}" placeholder="My TV"></label>
  <label>Server (Xtream)<input name="server" maxlength="300" value="${esc(cur?.server || "")}" placeholder="http://line.example.com:8080" autocomplete="off"></label>
  <label>Username (Xtream)<input name="username" maxlength="128" value="${esc(cur?.username || "")}" autocomplete="off"></label>
  <label>Password (Xtream)<input name="password" type="password" maxlength="128" placeholder="${cur?.kind === "xtream" ? "unchanged if empty" : ""}" autocomplete="new-password"></label>
  <label>M3U link<input name="url" maxlength="2000" placeholder="${cur?.kind === "m3u" ? "unchanged if empty" : "http://…/get.php?…"}" autocomplete="off"></label>`;
}

/** Libellés d'erreur du panneau (codes PanelError). */
export const ERRORS = {
  invalid_code: "This device code is not valid. It looks like 7F3K-92QD.",
  unknown_code: "No device with this code. Ask the customer to open the app and read the code on screen.",
  already_active: "This device is already activated.",
  no_credit: "Not enough credits. Please top up your balance.",
  agreement_required: "Please accept the reseller agreement first.",
  reseller_suspended: "Your reseller account is suspended.",
  device_limit: "This customer already uses all the devices of their license. Detach one first, or raise the device limit on the customer page.",
  device_cap: "That number of devices is above your limit.",
  devices_in_use: "More devices are attached than that: detach some first.",
  license_inactive: "This customer's license is not active. Renew it first.",
  unknown_customer: "Customer not found.",
  unknown_device: "Device not found.",
  message_empty: "Title and message are required.",
  name_required: "A display name is required.",
  invalid_login: "Identifiant invalide (3 à 32 caractères : lettres, chiffres, . _ -).",
  login_taken: "Cet identifiant est déjà utilisé.",
  invalid_amount: "Montant invalide.",
  unknown_reseller: "Revendeur introuvable.",
  conflict: "The operation could not be completed. Please try again.",
  not_distributor: "This feature is reserved for distributors.",
  has_subs: "Ce distributeur a des sous-revendeurs : impossible de le rétrograder.",
  trial_already_extended: "The free trial of this device has already been extended once.",
  invalid_server: "Server address not valid (it must start with http:// or https://).",
  invalid_m3u: "M3U link not valid (it must start with http:// or https://).",
  missing_credentials: "Username and password are required for Xtream Codes.",
  activate_first: "Activate this device first, then set up its IPTV subscription.",
};

/**
 * Identifiants d'un nouveau compte (ou d'un mot de passe réinitialisé) : adresse du panneau, identifiant, mot de passe
 * provisoire, et message prêt à envoyer au revendeur avec les étapes (connexion, nouveau mot de passe, contrat).
 */
function credentialsCard({ origin, login, password, fr = false, title }) {
  const url = `${origin || ""}/login`;
  const msg = fr
    ? `Bonjour,\n\nVotre espace revendeur Ultra TV Pro est prêt.\n\nAdresse : ${url}\nIdentifiant : ${login}\nMot de passe provisoire : ${password}\n\n1. Connectez-vous avec ces identifiants.\n2. Choisissez votre propre mot de passe (demandé à la première connexion).\n3. Lisez et signez le contrat revendeur (votre nom complet + « J'accepte »).\n4. Vous pouvez ensuite activer les appareils de vos clients avec vos crédits.`
    : `Hello,\n\nYour Ultra TV Pro reseller space is ready.\n\nAddress: ${url}\nLogin: ${login}\nTemporary password: ${password}\n\n1. Sign in with these credentials.\n2. Choose your own password (asked at first sign-in).\n3. Read and sign the reseller agreement (your full name + "I accept").\n4. You can then activate your customers' devices with your credits.`;
  const L = fr
    ? { url: "Adresse de connexion", login: "Identifiant", pwd: "Mot de passe provisoire", note: "Affiché une seule fois : transmettez-le maintenant. Le revendeur devra le changer à sa première connexion.", copy: "Message à envoyer au revendeur", btn: "Copier le message", done: "Copié ✓", wa: "Envoyer par WhatsApp" }
    : { url: "Sign-in address", login: "Login", pwd: "Temporary password", note: "Shown only once: send it now. They must change it at first sign-in.", copy: "Message to send", btn: "Copy the message", done: "Copied ✓", wa: "Send on WhatsApp" };
  return `<div class="card creds" style="margin-bottom:16px"><b>${esc(title)}</b>
  <table class="creds-table"><tr><th>${L.url}</th><td class="mono"><a href="${esc(url)}">${esc(url)}</a></td></tr>
  <tr><th>${L.login}</th><td class="mono">${esc(login)}</td></tr><tr><th>${L.pwd}</th><td><span class="secret">${esc(password)}</span></td></tr></table>
  <p class="muted" style="font-size:13px">${L.note}</p>
  <label>${L.copy}<textarea id="creds-msg" readonly rows="11" style="width:100%;font-family:inherit">${esc(msg)}</textarea></label>
  <div class="row" style="margin-top:12px"><button type="button" data-copy="creds-msg" data-done="${L.done}">${L.btn}</button>
  <a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener noreferrer">${L.wa}</a></div></div>`;
}

export function loginPage(n, error) {
  return page(n, "Sign in", `<div class="center"><div class="card">${brand("PRO · RESELLER")}<h1>Sign in</h1><p class="sub">Reseller panel</p>
  ${error ? `<div class="flash err">${esc(error)}</div>` : ""}
  <form method="post" action="/login"><label>Login<input name="login" autocomplete="username" required autofocus></label>
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form></div></div>`);
}

export function passwordPage(n, me, { forced, error }) {
  const fr = me.role === "admin";
  return page(n, fr ? "Mot de passe" : "Password", `<h1>${fr ? "Changer le mot de passe" : "Change password"}</h1>
  <p class="sub">${forced ? (fr ? "Choisissez un mot de passe personnel avant de continuer." : "Please choose your own password before continuing.") : ""}</p>
  ${error ? `<div class="flash err">${esc(error)}</div>` : ""}
  <form method="post" action="/password" class="card" style="max-width:420px;display:flex;flex-direction:column;gap:12px">${csrf(me)}
  <label>${fr ? "Mot de passe actuel" : "Current password"}<input name="current" type="password" autocomplete="current-password" required></label>
  <label>${fr ? "Nouveau mot de passe (10 caractères min.)" : "New password (min. 10 characters)"}<input name="next" type="password" minlength="10" autocomplete="new-password" required></label>
  <button>${fr ? "Enregistrer" : "Save"}</button></form>`, { me, nav: "profile" });
}

export function agreementPage(n, me, { error = null } = {}) {
  return page(n, "Reseller agreement", `<h1>Reseller agreement</h1><p class="sub">Version ${AGREEMENT_VERSION}. Please read and accept before activating devices.</p>
  <div class="card agreement">
  <h2>1. Purpose</h2><p>Ultra TV ("the Software") is a media player. It does not provide, host, sell or promote any television channel, film, series or other content. This agreement lets you resell <b>licenses to use the Software</b> ("Activations").</p>
  <h2>2. Activations and credits</h2><p>Credits are prepaid. One credit activates one customer for one year on up to two devices, or renews an existing customer for one year. Credits are non-refundable once used. Prices are those agreed in writing at purchase.</p>
  <h2>3. Content — your sole responsibility</h2><p>You confirm that any content, playlist, server or subscription that you or your customers use with the Software is <b>properly licensed</b> for distribution in the territories where you operate. You are solely responsible for your services, your subscriptions, your customers and your compliance with applicable laws, including copyright laws. You will not present the Software as including or providing content.</p>
  <h2>4. Branding and communication</h2><p>You will not use the Software's name in advertising that associates it with specific channels or content. Announcements you send through the panel must be lawful, relate to your service, and must not contain illegal material.</p>
  <h2>5. Customer data</h2><p>The panel stores the minimum needed (device code, optional customer label). You are responsible for any personal data you enter and must have your customers' consent.</p>
  <h2>6. Suspension and termination</h2><p>The Software provider may suspend your account at any time in case of breach of this agreement, legal request, or suspected unlawful use, without refund of used credits. A suspended account can no longer activate or renew devices. Activations already sold to your customers remain valid until their expiry date, unless a court or competent authority requires otherwise.</p>
  <h2>7. No warranty, liability</h2><p>The Software is provided "as is". To the extent permitted by law, the provider's liability is limited to the amount paid for unused credits. You indemnify the provider against any claim resulting from your services or content.</p>
  <h2>8. Changes</h2><p>New versions of this agreement will be presented in the panel and must be accepted to continue activating devices.</p>
  </div>
  <form method="post" action="/agreement" class="card" style="margin-top:16px;display:flex;flex-direction:column;gap:12px">${csrf(me)}
  <h2 style="margin:0">Signature</h2>
  ${error === "signer_required" ? `<div class="flash err">Please type your full name to sign.</div>` : ""}
  <label>Full name of the signatory (you, or the legal representative of your company)<input name="signer" required minlength="3" maxlength="80" autocomplete="name" placeholder="e.g. Basil Ahmed"></label>
  <label class="check"><input type="checkbox" name="accept" value="1" required> I have read and accept this agreement (version ${AGREEMENT_VERSION}), and I confirm that the content I distribute is properly licensed.</label>
  <p class="muted" style="font-size:13px;margin:0">Your name, the date and the version of the agreement are recorded as your electronic signature.</p>
  <div><button>Sign the agreement</button></div></form>`, { me });
}

function licPill(status, expiresAt, now = Date.now()) {
  if (status && status !== "active") return `<span class="pill suspended">${esc(status)}</span>`;
  if (!expiresAt) return `<span class="pill">—</span>`;
  if (expiresAt <= now) return `<span class="pill expired">expired</span>`;
  if (expiresAt - now < 30 * 24 * 3600_000) return `<span class="pill soon">expires soon</span>`;
  return `<span class="pill active">active</span>`;
}

function devicesSelect(name, cap, selected) {
  return `<select name="${name}">${Array.from({ length: cap }, (_, i) => i + 1).map((n) => `<option value="${n}"${n === selected ? " selected" : ""}>${n}</option>`).join("")}</select>`;
}

function stepper(name, min, max, value) {
  return `<div class="stepper"><button type="button" data-step="-1" aria-label="Fewer">−</button><input name="${name}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${value}" required><button type="button" data-step="1" aria-label="More">+</button></div>`;
}

function activateForm(me, customers, cap = 2) {
  return `<form method="post" action="/activate" class="card inline">${csrf(me)}
  <label>Device code<input class="code" name="code" placeholder="XXXX-XXXX" maxlength="11" required autocomplete="off"></label>
  <label>Customer<select name="customer"><option value="">New customer (1 credit)</option>${customers.filter((c) => c.devices < (c.max_devices ?? 2)).map((c) => `<option value="${esc(c.id)}">${esc(c.label || c.id.slice(0, 8))} — add device (free)</option>`).join("")}</select></label>
  <label>Label (optional)<input name="label" placeholder="e.g. Ahmed — room 2" maxlength="80"></label>
  <label>Devices (new customer)${stepper("devices", 1, cap, Math.min(2, cap))}</label>
  <button>Activate</button></form>`;
}

export function dashboardPage(n, me, { stats, customers, flash, agreementMissing, cap = 2 }) {
  return page(n, "Dashboard", `<h1>Dashboard</h1><p class="sub">Activate devices, renew licenses, reach your customers.</p>
  ${agreementMissing ? `<div class="flash err">You must <a href="/agreement">accept the reseller agreement</a> before activating devices.</div>` : ""}
  <div class="grid"><div class="card stat"><b>${stats.balance}</b><span>credits available</span></div>
  <div class="card stat"><b>${stats.customers}</b><span>customers</span></div>
  <div class="card stat"><b>${stats.monthOps}</b><span>activations & renewals this month</span></div>
  <div class="card stat"><b>${stats.expiringSoon}</b><span>licenses expiring within 30 days</span></div></div>
  <h2>Activate a device</h2><p class="muted">The customer opens Ultra TV Pro: the device code is shown on screen.</p>${activateForm(me, customers, cap)}
  <h2>Set up a customer's IPTV subscription</h2><p class="muted">Type the code shown on the customer's screen: the app adds the subscription by itself (no typing on the TV). Applies to all devices of that customer.</p>
  <form method="post" action="/iptv-by-code" class="card inline">${csrf(me)}
  <label>Device code<input class="code" name="code" placeholder="XXXX-XXXX" maxlength="11" required autocomplete="off"></label>${iptvFields(null)}<button>Send to the device</button></form>
  <h2>More tools</h2><div class="grid">
  <form method="post" action="/activate-bulk" class="card" style="display:flex;flex-direction:column;gap:10px">${csrf(me)}
    <b>Bulk activation</b><span class="muted">One code per line (1 credit each, new customers).</span>
    <textarea name="codes" placeholder="7F3K-92QD&#10;Q8MZ-4TRA" maxlength="4000" required></textarea><div><button>Activate all</button></div></form>
  <form method="post" action="/extend-trial" class="card" style="display:flex;flex-direction:column;gap:10px">${csrf(me)}
    <b>Extend a free trial</b><span class="muted">+7 days, free, once per device — to let a prospect keep testing.</span>
    <input class="code" name="code" placeholder="XXXX-XXXX" maxlength="11" required autocomplete="off"><div><button class="ghost">Extend trial</button></div></form>
  <div class="card" style="display:flex;flex-direction:column;gap:10px"><b>Exports (CSV)</b><span class="muted">Open in Excel or Google Sheets.</span>
    <a class="btn ghost" href="/export/customers.csv">Customers</a><a class="btn ghost" href="/export/ledger.csv">Credit history</a></div>
  </div>
  <h2>Expiring soon</h2>${customerTable(customers.filter((c) => c.expires_at && c.expires_at - Date.now() < 30 * 24 * 3600_000).slice(0, 20))}`, { me, nav: "home", flash });
}

function customerTable(list) {
  if (!list.length) return `<p class="muted">Nothing here.</p>`;
  return `<table><tr><th>Customer</th><th>License</th><th>Expires</th><th>Devices</th><th></th></tr>${list.map((c) => `<tr>
  <td>${esc(c.label || "—")}<div class="muted mono" style="font-size:12px">${esc(c.id.slice(0, 8))}</div></td><td>${licPill(c.lic_status, c.expires_at)}</td>
  <td>${fmtDate(c.expires_at)}</td><td>${c.devices} / ${c.max_devices ?? 2}</td><td><a class="btn ghost" href="/customers/${esc(c.id)}">Open</a></td></tr>`).join("")}</table>`;
}

export function customersPage(n, me, { customers, q, flash }) {
  return page(n, "Customers", `<h1>Customers</h1><p class="sub">${customers.length} customer(s). Each customer belongs to your account permanently.</p>
  <form method="get" action="/customers" class="inline" style="margin-bottom:14px"><input name="q" value="${esc(q)}" placeholder="Search label or device code"><button class="ghost">Search</button></form>
  ${customerTable(customers)}`, { me, nav: "customers", flash });
}

export function customerPage(n, me, { detail, flash, iptv = null, cap = 2 }) {
  const { customer: c, license: l, devices } = detail;
  const base = `/customers/${esc(c.id)}`;
  return page(n, c.label || "Customer", `<p><a href="/customers">← Customers</a></p><h1>${esc(c.label || "Customer")}</h1>
  <p class="sub">Customer since ${fmtDate(c.created_at)} · ${licPill(l?.status, l?.expires_at)} · expires ${fmtDate(l?.expires_at)}</p>
  <div class="row">
    <form method="post" action="${base}/renew">${csrf(me)}<button>Renew 1 year (1 credit)</button></form>
    ${l?.status === "suspended"
      ? `<form method="post" action="${base}/resume">${csrf(me)}<button class="ghost">Resume</button></form>`
      : `<form method="post" action="${base}/suspend">${csrf(me)}<button class="ghost">Suspend</button></form>`}
  </div>
  <h2>Devices (${devices.length} / ${l?.max_devices ?? 2})</h2>
  ${l && l.status !== "revoked" ? `<form method="post" action="${base}/max-devices" class="card inline" style="margin-bottom:12px">${csrf(me)}
  <label>Devices allowed on this license (your limit: ${cap})${stepper("max", Math.max(1, devices.length), Math.max(cap, l.max_devices ?? 2), l.max_devices ?? 2)}</label><button class="ghost">Update</button></form>` : ""}
  ${devices.length ? `<table><tr><th>Code</th><th>Device</th><th>App</th><th>Last seen</th><th></th></tr>${devices.map((d) => `<tr><td class="mono">${esc(d.code)}</td>
  <td>${esc(d.platform || "")} ${esc(d.model || "")}</td><td>${esc(d.app_version || "—")}</td><td>${fmtDateTime(d.last_seen_at)}</td>
  <td><form method="post" action="${base}/devices/${esc(d.id)}/detach">${csrf(me)}<button class="ghost">Detach</button></form></td></tr>`).join("")}</table>` : `<p class="muted">No device.</p>`}
  ${devices.length < (l?.max_devices ?? 2) ? `<h2>Add a device (free)</h2><form method="post" action="/activate" class="card inline">${csrf(me)}<input type="hidden" name="customer" value="${esc(c.id)}">
  <label>Device code<input class="code" name="code" placeholder="XXXX-XXXX" maxlength="11" required autocomplete="off"></label><button>Add device</button></form>` : ""}
  <h2>IPTV subscription</h2>${iptv ? `<p class="muted">Current: <b>${esc(iptv.name)}</b> · ${iptv.kind === "m3u" ? "M3U link" : `Xtream · ${esc(iptv.server)} · ${esc(iptv.username)}`} · updated ${fmtDateTime(iptv.updatedAt)}. Devices pick up changes within minutes.</p>` : `<p class="muted">None yet. The customer's devices will add it automatically.</p>`}
  <form method="post" action="${base}/iptv" class="card inline">${csrf(me)}${iptvFields(iptv)}<button>${iptv ? "Update" : "Send to the devices"}</button></form>
  ${iptv ? `<form method="post" action="${base}/iptv/remove" style="margin-top:8px">${csrf(me)}<button class="ghost">Remove the subscription from the devices</button></form>` : ""}
  <h2>Label & note</h2><form method="post" action="${base}/label" class="card" style="display:flex;flex-direction:column;gap:10px">${csrf(me)}
  <label>Label<input name="label" value="${esc(c.label || "")}" maxlength="80"></label><label>Private note<textarea name="note" maxlength="500">${esc(c.note || "")}</textarea></label><button>Save</button></form>`,
  { me, nav: "customers", flash });
}

const CATEGORIES = [["info", "Information"], ["maintenance", "Maintenance"], ["promo", "Promotion"]];
const catLabel = (c) => (CATEGORIES.find(([k]) => k === c) || CATEGORIES[0])[1];

export function messagesPage(n, me, { messages, customers, flash }) {
  return page(n, "Announcements", `<h1>Announcements</h1><p class="sub">Shown in the Ultra TV Pro inbox of your customers only (service updates, maintenance, renewal reminders, support notices).</p>
  <form method="post" action="/messages" class="compose">${csrf(me)}
  <div class="card" style="display:flex;flex-direction:column;gap:16px"><h2 style="margin:0">New announcement</h2>
  <fieldset class="chips"><legend>Type</legend>${CATEGORIES.map(([k, l], i) => `<label><input type="radio" name="category" value="${k}"${i === 0 ? " checked" : ""}><span>${l}</span></label>`).join("")}</fieldset>
  <label>Title<input name="title" maxlength="120" required placeholder="e.g. New sports channels"></label>
  <label>Message<textarea name="body" maxlength="2000" required placeholder="What your customers will read on their TV."></textarea></label>
  <div class="row"><label style="flex:1 1 220px">Send to<select name="target"><option value="all">All my customers (${customers.length})</option>${me.is_distributor === 1 ? `<option value="network">My whole network (all sub-resellers' customers)</option>` : ""}${customers.map((c) => `<option value="${esc(c.id)}">${esc(c.label || c.id.slice(0, 8))}</option>`).join("")}</select></label>
  <label style="flex:1 1 160px">Visible for<select name="days"><option value="">No end</option><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label></div>
  <div style="display:flex;justify-content:flex-end"><button>Send</button></div></div>
  <section aria-label="Preview on the TV" style="display:flex;flex-direction:column;gap:12px">
  <span style="font-size:12px;font-weight:700;color:var(--t2);letter-spacing:.12em;text-transform:uppercase">Preview on the TV</span>
  <div class="tv" data-preview='${esc(JSON.stringify(Object.fromEntries(CATEGORIES)))}'><div class="tv-head"><b>Inbox</b><span class="tv-new">New</span></div>
  <article><span class="tag info" data-pv="tag">Information</span><b data-pv="title" data-empty="Your title">Your title</b><p data-pv="body" data-empty="Your message appears here.">Your message appears here.</p></article>
  <article class="dim"><span class="tag maintenance">Reminder</span><b>Your license ends in 4 days</b><p>Contact your reseller to renew.</p></article></div></section>
  </form>
  <h2>Sent</h2>${messages.length ? `<table><tr><th>Date</th><th>To</th><th>Message</th><th>Read by</th><th></th></tr>${messages.map((m) => `<tr><td>${fmtDateTime(m.created_at)}</td>
  <td>${m.target === "all" ? "All" : m.target === "network" ? "Whole network" : esc(m.target_label || "1 customer")}</td><td><span class="cat ${esc(m.category || "info")}">${catLabel(m.category)}</span><br><b>${esc(m.title)}</b><div class="muted">${esc(m.body).slice(0, 300)}</div>${m.expires_at ? `<div class="muted" style="font-size:12px">until ${fmtDate(m.expires_at)}</div>` : ""}</td>
  <td>${m.reads} device(s)</td><td><form method="post" action="/messages/${esc(m.id)}/delete">${csrf(me)}<button class="ghost">Delete</button></form></td></tr>`).join("")}</table>` : `<p class="muted">No announcement yet.</p>`}`,
  { me, nav: "messages", flash });
}

export function profilePage(n, me, { r, flash }) {
  if (me.role === "admin") {
    return page(n, "Mon compte", `<h1>Mon compte</h1><p class="sub">Administrateur · ${esc(r.login)}</p><p><a class="btn ghost" href="/password">Changer le mot de passe</a></p>`, { me, nav: "profile", flash });
  }
  return page(n, "Profile", `<h1>Profile</h1><p class="sub">Shown to your customers in the app (name and support contact).</p>
  <form method="post" action="/profile" class="card" style="display:flex;flex-direction:column;gap:10px;max-width:560px">${csrf(me)}
  <label>Display name<input name="name" value="${esc(r.name)}" maxlength="60" required></label>
  <label>WhatsApp number (international, e.g. +971…)<input name="whatsapp" value="${esc(r.support_whatsapp || "")}" maxlength="32"></label>
  <label>Telegram username<input name="telegram" value="${esc(r.support_telegram || "")}" maxlength="64"></label>
  <label>Support text<textarea name="supportText" maxlength="300">${esc(r.support_text || "")}</textarea></label>
  <label>Automatic renewal reminder in your customers' inbox<select name="reminderDays">${[[0, "Off"], [7, "7 days before expiry"], [15, "15 days before expiry"], [30, "30 days before expiry"]].map(([v, t]) => `<option value="${v}"${(r.reminder_days ?? 15) === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
  <div><button>Save</button></div></form>
  <h2>Account</h2><p class="muted">Login: <span class="mono">${esc(r.login)}</span> · Agreement accepted: ${r.agreement_signed_at ? `${fmtDate(r.agreement_signed_at)} (v${esc(r.agreement_version || "")})` : `<a href="/agreement">not yet</a>`}</p>
  <p><a class="btn ghost" href="/password">Change password</a></p>`, { me, nav: "profile", flash });
}

export function adminPage(n, me, { resellers, flash, created, origin = "" }) {
  return page(n, "Revendeurs", `<h1>Revendeurs</h1><p class="sub">Créer des comptes, ajouter des crédits après paiement, suspendre.</p>
  ${created ? credentialsCard({ origin, login: created.login, password: created.password, fr: true, title: `Compte créé : ${created.login}` }) : ""}
  <form method="post" action="/admin/resellers" class="card inline">${csrf(me)}
  <label>Identifiant<input name="login" pattern="[a-z0-9][a-z0-9._\\-]{2,31}" required placeholder="basil"></label><label>Nom affiché<input name="name" required maxlength="60" placeholder="Basil TV"></label>
  <label class="check"><input type="checkbox" name="distributor" value="1"> Distributeur</label><button>Créer le revendeur</button></form>
  <p class="muted" style="font-size:13px;margin:6px 2px 0">Un distributeur peut créer ses propres sous-revendeurs et leur transférer des crédits.</p>
  <h2>Liste</h2>${resellers.length ? `<table><tr><th>Revendeur</th><th>Type</th><th>Statut</th><th>Crédits</th><th>Clients</th><th>Contrat</th><th></th></tr>${resellers.filter((r) => r.role === "reseller").map((r) => `<tr>
  <td><b>${esc(r.name)}</b><div class="muted mono">${esc(r.login)}</div></td>
  <td>${r.is_distributor === 1 ? `<span class="pill active">distributeur</span> <span class="muted">${r.subs} sous-rev.</span>` : r.parent_id ? `<span class="muted">sous-revendeur de ${esc(r.parent_name || "?")}</span>` : "revendeur"}</td><td><span class="pill ${r.status === "active" ? "active" : "suspended"}">${esc(r.status)}</span></td>
  <td>${r.balance}</td><td>${r.customers}</td><td>${r.agreement_signed_at ? `${fmtDate(r.agreement_signed_at)}${r.agreement_signer ? `<div class="muted">${esc(r.agreement_signer)}</div>` : ""}` : "<span class='muted'>non signé</span>"}</td>
  <td><a class="btn ghost" href="/admin/resellers/${esc(r.id)}">Gérer</a></td></tr>`).join("")}</table>` : `<p class="muted">Aucun revendeur.</p>`}`,
  { me, nav: "admin", flash });
}

export function adminResellerPage(n, me, { r, bal, entries, flash, password, origin = "" }) {
  const base = `/admin/resellers/${esc(r.id)}`;
  return page(n, r.name, `<p><a href="/admin">← Revendeurs</a></p><h1>${esc(r.name)}</h1>
  <p class="sub"><span class="mono">${esc(r.login)}</span> · <span class="pill ${r.status === "active" ? "active" : "suspended"}">${esc(r.status)}</span> · solde <b>${bal}</b> crédit(s) · contrat ${r.agreement_signed_at ? `signé le ${fmtDate(r.agreement_signed_at)}${r.agreement_signer ? ` par <b>${esc(r.agreement_signer)}</b>` : ""} (v${esc(r.agreement_version || "")})` : "non signé"}</p>
  ${r.agreement_signed_at ? "" : `<p class="muted" style="font-size:13px;margin-top:-10px">Le contrat est accepté par le revendeur lui-même : il lui est présenté dès sa connexion (après le changement de mot de passe). Aucune activation n'est possible avant.</p>`}
  ${password ? credentialsCard({ origin, login: r.login, password, fr: true, title: "Nouveau mot de passe provisoire" }) : ""}
  <h2>Crédits</h2><form method="post" action="${base}/credits" class="card inline">${csrf(me)}
  <label>Nombre (négatif = correction)<input name="amount" type="number" required step="1"></label><label>Note (référence du paiement)<input name="note" maxlength="200"></label><button>Enregistrer</button></form>
  <h2>Appareils par licence</h2><form method="post" action="${base}/device-cap" class="card inline">${csrf(me)}
  <label>Plafond (le revendeur choisit de 1 à ce nombre pour chaque client)${devicesSelect("cap", 10, r.max_devices_cap ?? 5)}</label><button>Enregistrer</button></form>
  <h2>Compte</h2><div class="card acts">
  <div class="act"><form method="post" action="${base}/status">${csrf(me)}<input type="hidden" name="status" value="${r.status === "active" ? "suspended" : "active"}"><button class="${r.status === "active" ? "danger" : ""}">${r.status === "active" ? "Suspendre" : "Réactiver"}</button></form>
    <span class="muted">${r.status === "active" ? "Bloque son accès au panneau et ses nouvelles activations. Ses clients gardent leur licence jusqu'à expiration." : "Rend l'accès au panneau et les activations."}</span></div>
  <div class="act"><form method="post" action="${base}/reset-password">${csrf(me)}<button class="ghost">Réinitialiser le mot de passe</button></form>
    <span class="muted">Génère un mot de passe provisoire (affiché une fois) ; il devra en choisir un nouveau.</span></div>
  ${r.parent_id ? "" : `<div class="act"><form method="post" action="${base}/distributor">${csrf(me)}<input type="hidden" name="on" value="${r.is_distributor === 1 ? "0" : "1"}"><button class="ghost">${r.is_distributor === 1 ? "Retirer distributeur" : "Passer distributeur"}</button></form>
    <span class="muted">${r.is_distributor === 1 ? "Impossible tant qu'il a des sous-revendeurs." : "Il pourra créer des sous-revendeurs et leur transférer des crédits (menu Network)."}</span></div>`}</div>
  <h2>Grand livre</h2>${entries.length ? `<table><tr><th>Date</th><th>Mouvement</th><th>Motif</th><th>Note</th><th>Par</th></tr>${entries.map((e) => `<tr><td>${fmtDateTime(e.created_at)}</td>
  <td><b>${e.delta > 0 ? "+" : ""}${e.delta}</b></td><td>${esc(e.reason)}</td><td class="mono">${esc(e.note || "")}</td><td>${esc(e.created_by)}</td></tr>`).join("")}</table>` : `<p class="muted">Aucun mouvement.</p>`}`,
  { me, nav: "admin", flash });
}

export function downloadPage(n, links) {
  return page(n, "Download", `<div class="center"><div class="card" style="max-width:560px">${brand("PRO")}<h1>Ultra TV Pro</h1>
  <p class="sub">Install the app, open it and give the device code shown on screen to your provider to activate it. Ultra TV Pro is a media player: it does not include any channel or content.</p>
  <div style="display:flex;flex-direction:column;gap:10px">
  ${links.map((l) => `<a class="btn ${l.primary ? "" : "ghost"}" href="${esc(l.url)}">${esc(l.label)}</a>`).join("")}
  </div><p class="muted" style="font-size:13px;margin-top:14px">Android TV / Google TV: install the APK with "Downloader" or a file manager. Most boxes use the arm64 version.</p></div></div>`);
}


export function bulkResultPage(n, me, { results }) {
  const ok = results.filter((r) => r.ok).length;
  return page(n, "Bulk activation", `<p><a href="/">← Dashboard</a></p><h1>Bulk activation</h1><p class="sub">${ok} of ${results.length} code(s) activated.</p>
  <table><tr><th>Code</th><th>Result</th></tr>${results.map((r) => `<tr><td class="mono">${esc(r.code)}</td><td>${r.ok ? `<span class="pill active">activated</span>` : `<span class="pill expired">${esc(ERRORS[r.error] || r.error)}</span>`}</td></tr>`).join("")}</table>`,
  { me, nav: "home" });
}

export function networkPage(n, me, { stats, subs, flash, created, origin = "" }) {
  return page(n, "Network", `<h1>Network</h1><p class="sub">Your sub-resellers: give them credits from your balance, follow their activity, suspend them if needed.</p>
  ${created ? credentialsCard({ origin, login: created.login, password: created.password, title: `Sub-reseller created: ${created.login}` }) : ""}
  <div class="grid"><div class="card stat"><b>${stats.subs}</b><span>sub-resellers (${stats.activeSubs} active)</span></div>
  <div class="card stat"><b>${stats.subCredits}</b><span>credits held by sub-resellers</span></div>
  <div class="card stat"><b>${stats.networkCustomers}</b><span>customers in your network</span></div>
  <div class="card stat"><b>${stats.networkOps30}</b><span>sub-reseller activations & renewals (30 days)</span></div></div>
  <h2>Add a sub-reseller</h2><form method="post" action="/network" class="card inline">${csrf(me)}
  <label>Login<input name="login" pattern="[a-z0-9][a-z0-9._\\-]{2,31}" required placeholder="shop-dubai"></label><label>Display name<input name="name" required maxlength="60" placeholder="Dubai Shop"></label><button>Create</button></form>
  <h2>Sub-resellers</h2>${subs.length ? `<table><tr><th>Sub-reseller</th><th>Status</th><th>Credits</th><th>Customers</th><th>30 days</th><th>Last activation</th><th></th></tr>${subs.map((r) => `<tr>
  <td><b>${esc(r.name)}</b><div class="muted mono">${esc(r.login)}</div></td><td><span class="pill ${r.status === "active" ? "active" : "suspended"}">${esc(r.status)}</span>${r.agreement_signed_at ? "" : ` <span class="muted">agreement pending</span>`}</td>
  <td>${r.balance}</td><td>${r.customers}</td><td>${r.ops30}</td><td>${r.last_op ? new Date(r.last_op).toISOString().slice(0, 10) : "—"}</td><td><a class="btn ghost" href="/network/${esc(r.id)}">Manage</a></td></tr>`).join("")}</table>` : `<p class="muted">No sub-reseller yet.</p>`}`,
  { me, nav: "network", flash });
}

export function subResellerPage(n, me, { r, bal, myBal, entries, flash, password, stats = null, myCap = 5, origin = "" }) {
  const base = `/network/${esc(r.id)}`;
  return page(n, r.name, `<p><a href="/network">← Network</a></p><h1>${esc(r.name)}</h1>
  <p class="sub"><span class="mono">${esc(r.login)}</span> · <span class="pill ${r.status === "active" ? "active" : "suspended"}">${esc(r.status)}</span> · <b>${bal}</b> credit(s) · agreement ${r.agreement_signed_at ? "accepted" : "pending"}</p>
  ${password ? credentialsCard({ origin, login: r.login, password, title: "New temporary password" }) : ""}
  ${stats ? `<div class="grid"><div class="card"><div class="muted">Customers</div><b style="font-size:26px">${stats.customers}</b></div>
  <div class="card"><div class="muted">Activations + renewals this month</div><b style="font-size:26px">${stats.monthOps}</b></div>
  <div class="card"><div class="muted">Licenses expiring in 30 days</div><b style="font-size:26px">${stats.expiringSoon}</b></div></div>` : ""}
  <h2>Devices per license</h2><form method="post" action="${base}/device-cap" class="card inline">${csrf(me)}
  <label>Limit (your own limit: ${myCap})${devicesSelect("cap", myCap, Math.min(r.max_devices_cap ?? 5, myCap))}</label><button>Save</button></form>
  <h2>Credits</h2><div class="grid">
  <form method="post" action="${base}/transfer" class="card inline">${csrf(me)}<label>Give credits (your balance: ${myBal})<input name="amount" type="number" min="1" step="1" required></label><button>Transfer</button></form>
  <form method="post" action="${base}/reclaim" class="card inline">${csrf(me)}<label>Take back unused credits<input name="amount" type="number" min="1" step="1" required></label><button class="ghost">Take back</button></form></div>
  <h2>Account</h2><div class="card acts">
  <div class="act"><form method="post" action="${base}/status">${csrf(me)}<input type="hidden" name="status" value="${r.status === "active" ? "suspended" : "active"}"><button class="${r.status === "active" ? "danger" : ""}">${r.status === "active" ? "Suspend" : "Reactivate"}</button></form>
    <span class="muted">${r.status === "active" ? "Blocks their panel access and new activations. Their customers keep their license until it expires." : "Restores panel access and activations."}</span></div>
  <div class="act"><form method="post" action="${base}/reset-password">${csrf(me)}<button class="ghost">Reset password</button></form>
    <span class="muted">Creates a temporary password (shown once); they will choose a new one.</span></div></div>
  <h2>Credit history</h2>${entries.length ? `<table><tr><th>Date</th><th>Change</th><th>Reason</th><th>By</th></tr>${entries.map((e) => `<tr><td>${new Date(e.created_at).toISOString().slice(0, 16).replace("T", " ")}</td>
  <td><b>${e.delta > 0 ? "+" : ""}${e.delta}</b></td><td>${esc(e.reason)}</td><td>${esc(e.created_by)}</td></tr>`).join("")}</table>` : `<p class="muted">No movement.</p>`}`,
  { me, nav: "network", flash });
}
