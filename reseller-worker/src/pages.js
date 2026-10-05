// Pages HTML du panneau (rendu serveur, aucune dépendance, CSP stricte avec nonce).
// Panneau revendeur en anglais (revendeurs internationaux), administration en français.
// TOUT texte venant de la base passe par esc().

import { escapeHtml as esc } from "./lib/http.js";
import { AGREEMENT_VERSION } from "./panel.js";

const fmtDate = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "—");
const fmtDateTime = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");

const CSS = `
:root{--bg:#f4f3ef;--surface:#fff;--s2:#ecebe6;--text:#16151a;--t2:#5b5a60;--accent:#d91e2b;--ok:#1f8a4c;--warn:#b26a00;--line:#e2e0da}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e11;--surface:#18181c;--s2:#232328;--text:#f3f3f5;--t2:#a5a4ab;--line:#2c2c32}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
a{color:inherit}header{display:flex;align-items:center;gap:16px;padding:14px 24px;background:var(--surface);border-bottom:1px solid var(--line);flex-wrap:wrap}
header .brand{font-weight:800;font-size:17px;display:flex;align-items:center;gap:8px}header .brand i{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent)}
header nav{display:flex;gap:4px;flex-wrap:wrap;flex:1}header nav a{padding:6px 12px;border-radius:999px;text-decoration:none;font-weight:600;color:var(--t2)}
header nav a.on,header nav a:hover{background:var(--s2);color:var(--text)}main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px}.sub{color:var(--t2);margin:0 0 18px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px}.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.stat b{display:block;font-size:30px;font-weight:800}.stat span{color:var(--t2);font-size:13px}
form.inline{display:flex;gap:8px;flex-wrap:wrap;align-items:end}label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--t2)}
input,select,textarea{font:inherit;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);min-width:0}
textarea{min-height:110px;width:100%}input.code{font:700 20px ui-monospace,monospace;letter-spacing:2px;text-transform:uppercase;width:12ch}
button,.btn{font:inherit;font-weight:700;padding:9px 16px;border-radius:999px;border:0;background:var(--text);color:var(--bg);cursor:pointer;text-decoration:none;display:inline-block}
button.ghost,.btn.ghost{background:var(--s2);color:var(--text)}button.danger{background:var(--accent);color:#fff}
table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:16px;overflow:hidden;border:1px solid var(--line)}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);font-size:14px;vertical-align:top}th{color:var(--t2);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
tr:last-child td{border-bottom:0}.mono{font-family:ui-monospace,monospace}.muted{color:var(--t2)}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;background:var(--s2)}
.pill.active{background:#1f8a4c22;color:var(--ok)}.pill.expired,.pill.suspended{background:#d91e2b22;color:var(--accent)}.pill.soon{background:#b26a0022;color:var(--warn)}
.flash{padding:12px 16px;border-radius:12px;margin:0 0 16px;font-weight:600}.flash.ok{background:#1f8a4c1f;color:var(--ok)}.flash.err{background:#d91e2b1f;color:var(--accent)}
.secret{font:700 18px ui-monospace,monospace;background:var(--s2);padding:10px 14px;border-radius:10px;display:inline-block;user-select:all}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}.center .card{width:100%;max-width:400px}
.center form{display:flex;flex-direction:column;gap:12px}.agreement{max-height:52vh;overflow:auto;background:var(--bg);border-radius:12px;padding:4px 18px;border:1px solid var(--line)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.check{display:flex;flex-direction:row;align-items:center;gap:8px;min-height:42px;color:var(--text);font-size:14px;font-weight:600;cursor:pointer}
.check input{width:18px;height:18px;margin:0;accent-color:var(--accent)}form.inline .check{align-self:flex-end}
.acts{display:flex;flex-direction:column;gap:2px;padding:6px 18px}.act{display:grid;grid-template-columns:minmax(220px,auto) 1fr;gap:16px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
.act:last-child{border-bottom:0}.act form{margin:0}.act button{width:100%}.act .muted{font-size:13px}
@media (max-width:640px){.act{grid-template-columns:1fr;gap:6px}}
`;

function page(n, title, body, { me = null, nav = "", flash = null } = {}) {
  const links = !me ? "" : me.role === "admin"
    ? [["/admin", "Revendeurs", "admin"], ["/profile", "Mon compte", "profile"]]
    : [["/", "Dashboard", "home"], ["/customers", "Customers", "customers"], ...(me.is_distributor === 1 ? [["/network", "Network", "network"]] : []),
       ["/messages", "Announcements", "messages"], ["/profile", "Profile", "profile"]];
  const head = me ? `<header><div class="brand"><i></i>Ultra TV Pro</div><nav>${links.map(([h, l, k]) => `<a href="${h}" class="${k === nav ? "on" : ""}">${l}</a>`).join("")}</nav>
    <span class="muted">${esc(me.name)}</span><form method="post" action="/logout"><input type="hidden" name="csrf" value="${esc(me.csrf)}"><button class="ghost">${me.role === "admin" ? "Déconnexion" : "Log out"}</button></form></header>` : "";
  const fl = flash ? `<div class="flash ${flash.ok ? "ok" : "err"}">${esc(flash.text)}</div>` : "";
  return `<!doctype html><html lang="${me?.role === "admin" ? "fr" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${esc(title)} · Ultra TV Pro</title><style nonce="${n}">${CSS}</style></head><body>${head}${me ? `<main>${fl}${body}</main>` : body}</body></html>`;
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

export function loginPage(n, error) {
  return page(n, "Sign in", `<div class="center"><div class="card"><h1>Ultra TV Pro</h1><p class="sub">Reseller panel</p>
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

export function agreementPage(n, me) {
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
  <form method="post" action="/agreement" class="row" style="margin-top:16px">${csrf(me)}
  <label class="check" style="flex:1"><input type="checkbox" name="accept" value="1" required> I have read and accept this agreement, and I confirm that the content I distribute is properly licensed.</label>
  <button>Accept</button></form>`, { me });
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

function activateForm(me, customers, cap = 2) {
  return `<form method="post" action="/activate" class="card inline">${csrf(me)}
  <label>Device code<input class="code" name="code" placeholder="XXXX-XXXX" maxlength="11" required autocomplete="off"></label>
  <label>Customer<select name="customer"><option value="">New customer (1 credit)</option>${customers.filter((c) => c.devices < (c.max_devices ?? 2)).map((c) => `<option value="${esc(c.id)}">${esc(c.label || c.id.slice(0, 8))} — add device (free)</option>`).join("")}</select></label>
  <label>Label (optional)<input name="label" placeholder="e.g. Ahmed — room 2" maxlength="80"></label>
  <label>Devices (new customer)${devicesSelect("devices", cap, Math.min(2, cap))}</label>
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
  <label>Devices allowed on this license (your limit: ${cap})${devicesSelect("max", Math.max(cap, l.max_devices ?? 2), l.max_devices ?? 2)}</label><button class="ghost">Update</button></form>` : ""}
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

export function messagesPage(n, me, { messages, customers, flash }) {
  return page(n, "Announcements", `<h1>Announcements</h1><p class="sub">Shown in the Ultra TV Pro inbox of your customers only (service updates, maintenance, renewal reminders, support notices).</p>
  <form method="post" action="/messages" class="card" style="display:flex;flex-direction:column;gap:10px">${csrf(me)}
  <div class="row"><label style="flex:1">Title<input name="title" maxlength="120" required></label>
  <label>Send to<select name="target"><option value="all">All my customers</option>${me.is_distributor === 1 ? `<option value="network">My whole network (all sub-resellers' customers)</option>` : ""}${customers.map((c) => `<option value="${esc(c.id)}">${esc(c.label || c.id.slice(0, 8))}</option>`).join("")}</select></label>
  <label>Visible for<select name="days"><option value="">No end</option><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label></div>
  <label>Message<textarea name="body" maxlength="2000" required></textarea></label><div><button>Send</button></div></form>
  <h2>Sent</h2>${messages.length ? `<table><tr><th>Date</th><th>To</th><th>Message</th><th>Read by</th><th></th></tr>${messages.map((m) => `<tr><td>${fmtDateTime(m.created_at)}</td>
  <td>${m.target === "all" ? "All" : m.target === "network" ? "Whole network" : esc(m.target_label || "1 customer")}</td><td><b>${esc(m.title)}</b><div class="muted">${esc(m.body).slice(0, 300)}</div>${m.expires_at ? `<div class="muted" style="font-size:12px">until ${fmtDate(m.expires_at)}</div>` : ""}</td>
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

export function adminPage(n, me, { resellers, flash, created }) {
  return page(n, "Revendeurs", `<h1>Revendeurs</h1><p class="sub">Créer des comptes, ajouter des crédits après paiement, suspendre.</p>
  ${created ? `<div class="card" style="margin-bottom:16px"><b>Compte créé : ${esc(created.login)}</b><p>Mot de passe provisoire (affiché une seule fois, à transmettre au revendeur ; il devra le changer) :</p><span class="secret">${esc(created.password)}</span></div>` : ""}
  <form method="post" action="/admin/resellers" class="card inline">${csrf(me)}
  <label>Identifiant<input name="login" pattern="[a-z0-9][a-z0-9._\\-]{2,31}" required placeholder="basil"></label><label>Nom affiché<input name="name" required maxlength="60" placeholder="Basil TV"></label>
  <label class="check"><input type="checkbox" name="distributor" value="1"> Distributeur</label><button>Créer le revendeur</button></form>
  <p class="muted" style="font-size:13px;margin:6px 2px 0">Un distributeur peut créer ses propres sous-revendeurs et leur transférer des crédits.</p>
  <h2>Liste</h2>${resellers.length ? `<table><tr><th>Revendeur</th><th>Type</th><th>Statut</th><th>Crédits</th><th>Clients</th><th>Contrat</th><th></th></tr>${resellers.filter((r) => r.role === "reseller").map((r) => `<tr>
  <td><b>${esc(r.name)}</b><div class="muted mono">${esc(r.login)}</div></td>
  <td>${r.is_distributor === 1 ? `<span class="pill active">distributeur</span> <span class="muted">${r.subs} sous-rev.</span>` : r.parent_id ? `<span class="muted">sous-revendeur de ${esc(r.parent_name || "?")}</span>` : "revendeur"}</td><td><span class="pill ${r.status === "active" ? "active" : "suspended"}">${esc(r.status)}</span></td>
  <td>${r.balance}</td><td>${r.customers}</td><td>${r.agreement_signed_at ? fmtDate(r.agreement_signed_at) : "<span class='muted'>non signé</span>"}</td>
  <td><a class="btn ghost" href="/admin/resellers/${esc(r.id)}">Gérer</a></td></tr>`).join("")}</table>` : `<p class="muted">Aucun revendeur.</p>`}`,
  { me, nav: "admin", flash });
}

export function adminResellerPage(n, me, { r, bal, entries, flash, password }) {
  const base = `/admin/resellers/${esc(r.id)}`;
  return page(n, r.name, `<p><a href="/admin">← Revendeurs</a></p><h1>${esc(r.name)}</h1>
  <p class="sub"><span class="mono">${esc(r.login)}</span> · <span class="pill ${r.status === "active" ? "active" : "suspended"}">${esc(r.status)}</span> · solde <b>${bal}</b> crédit(s) · contrat ${r.agreement_signed_at ? `signé le ${fmtDate(r.agreement_signed_at)}` : "non signé"}</p>
  ${r.agreement_signed_at ? "" : `<p class="muted" style="font-size:13px;margin-top:-10px">Le contrat est accepté par le revendeur lui-même : il lui est présenté dès sa connexion (après le changement de mot de passe). Aucune activation n'est possible avant.</p>`}
  ${password ? `<div class="card" style="margin-bottom:16px"><b>Nouveau mot de passe provisoire</b> (affiché une seule fois) : <span class="secret">${esc(password)}</span></div>` : ""}
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
  return page(n, "Download", `<div class="center"><div class="card" style="max-width:560px"><h1>Ultra TV Pro</h1>
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

export function networkPage(n, me, { stats, subs, flash, created }) {
  return page(n, "Network", `<h1>Network</h1><p class="sub">Your sub-resellers: give them credits from your balance, follow their activity, suspend them if needed.</p>
  ${created ? `<div class="card" style="margin-bottom:16px"><b>Sub-reseller created: ${esc(created.login)}</b><p>Temporary password (shown once — send it to them; they will choose their own at first sign-in):</p><span class="secret">${esc(created.password)}</span></div>` : ""}
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

export function subResellerPage(n, me, { r, bal, myBal, entries, flash, password, stats = null, myCap = 5 }) {
  const base = `/network/${esc(r.id)}`;
  return page(n, r.name, `<p><a href="/network">← Network</a></p><h1>${esc(r.name)}</h1>
  <p class="sub"><span class="mono">${esc(r.login)}</span> · <span class="pill ${r.status === "active" ? "active" : "suspended"}">${esc(r.status)}</span> · <b>${bal}</b> credit(s) · agreement ${r.agreement_signed_at ? "accepted" : "pending"}</p>
  ${password ? `<div class="card" style="margin-bottom:16px"><b>New temporary password</b> (shown once): <span class="secret">${esc(password)}</span></div>` : ""}
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
