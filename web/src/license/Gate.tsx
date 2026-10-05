// Édition Pro : porte de licence (essai, activation par le revendeur, expiration), bandeau et annonces.
// Édition standard : rend simplement son contenu.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { IS_PRO } from "@/edition";
import { bridge } from "@/net/transport";
import { usePrefs } from "@/state/prefs";
import { cachedLicense, deviceCode, fetchInbox, fetchResellerSources, markAnnouncementsRead, refreshLicense, type Announcement } from "./client";
import { applyResellerSources } from "./provision";
import { daysLeft, licenseAllows, supportLink, type LicensePayload } from "./logic";

type State =
  | { kind: "loading" }
  | { kind: "allowed"; p: LicensePayload }
  | { kind: "blocked"; p: LicensePayload | null; code: string; offline: boolean };

/** `unread` : file des annonces à présenter au démarrage ; `inboxCount` : non lus (pastille du menu Abonnement). */
export const useLicense = create<{ state: State; checking: boolean; unread: Announcement[]; inboxCount: number }>(() => ({ state: { kind: "loading" }, checking: false, unread: [], inboxCount: 0 }));

function apply(p: LicensePayload, offline: boolean) {
  useLicense.setState({ state: licenseAllows(p) ? { kind: "allowed", p } : { kind: "blocked", p, code: p.code, offline }, inboxCount: p.unread ?? 0 });
}

const RENEW = {
  en: { title: "Your Ultra TV Pro license expires soon", body: (d: string, w: string) => `Your license expires on ${d}. Contact ${w} to renew it.`, who: "your provider" },
  fr: { title: "Votre licence Ultra TV Pro expire bientôt", body: (d: string, w: string) => `Votre licence expire le ${d}. Contactez ${w} pour la renouveler.`, who: "votre fournisseur" },
  ar: { title: "ترخيص Ultra TV Pro ينتهي قريبًا", body: (d: string, w: string) => `ينتهي ترخيصك في ${d}. تواصل مع ${w} لتجديده.`, who: "مزوّدك" },
};

/** Titre et texte affichés : traduits pour un rappel automatique, tels quels pour une annonce du revendeur. */
export function announcementText(a: Announcement, from: string | null, lang: string): { title: string; body: string } {
  if (a.kind !== "renewal" || !a.until) return { title: a.title, body: a.body };
  const r = lang === "fr" ? RENEW.fr : lang === "ar" ? RENEW.ar : RENEW.en;
  const d = new Date(a.until).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" });
  return { title: r.title, body: r.body(d, from ?? r.who) };
}

/** Message lu (fenêtre de démarrage ou boîte de réception) : serveur et pastille. */
export function noteRead(a: Announcement) {
  useLicense.setState((s) => ({ unread: s.unread.filter((m) => m.id !== a.id), inboxCount: Math.max(0, s.inboxCount - (a.read ? 0 : 1)) }));
  void markAnnouncementsRead([a.id]);
}

export async function checkLicense() {
  if (useLicense.getState().checking) return;
  useLicense.setState({ checking: true });
  const b = bridge();
  try {
    const p = await refreshLicense(b ? `desktop-${b.platform}` : "web", b?.version ?? "web");
    apply(p, false);
    // Licence active : abonnement IPTV configuré par le revendeur (ajout / mise à jour / retrait de la source).
    if (p.status === "active") {
      const remote = await fetchResellerSources();
      if (remote) await applyResellerSources(remote).catch(() => undefined);
    }
    if (p.unread > 0) useLicense.setState({ unread: (await fetchInbox()).filter((m) => !m.read).sort((x, y) => x.at - y.at) });
  } catch {
    const cached = await cachedLicense();
    if (cached) apply(cached, true);
    else useLicense.setState({ state: { kind: "blocked", p: null, code: await deviceCode(), offline: true } });
  } finally {
    useLicense.setState({ checking: false });
  }
}

let started = false;
function start() {
  if (started) return;
  started = true;
  document.title = "Ultra TV Pro";
  void cachedLicense().then((c) => { if (c && useLicense.getState().state.kind === "loading") apply(c, true); });
  void checkLicense();
  // Toutes les 15 min : un abonnement configuré par le revendeur arrive vite sur l'appareil.
  setInterval(() => void checkLicense(), 15 * 60_000);
}

const STR = {
  en: {
    title: "Activate Ultra TV Pro", give: "Give this code to your provider to activate the app:", expired: "Your license has expired.",
    trialOver: "Your free trial is over.", suspended: "This device is suspended. Please contact your provider.",
    offline: "No connection to the activation server. Check your internet connection.", again: "Check again", checking: "Checking…",
    contact: "Contact support", trial: (d: number, c: string) => `Free trial: ${d} day(s) left · code ${c}`,
    expires: (d: number) => `License expires in ${d} day(s) — contact your provider to renew`, from: (n: string) => `Message from ${n}`, ok: "OK", provider: "your provider",
  },
  fr: {
    title: "Activer Ultra TV Pro", give: "Donnez ce code à votre fournisseur pour activer l'application :", expired: "Votre licence a expiré.",
    trialOver: "Votre essai gratuit est terminé.", suspended: "Cet appareil est suspendu. Contactez votre fournisseur.",
    offline: "Pas de connexion au serveur d'activation. Vérifiez votre connexion internet.", again: "Vérifier à nouveau", checking: "Vérification…",
    contact: "Contacter le support", trial: (d: number, c: string) => `Essai gratuit : ${d} jour(s) restant(s) · code ${c}`,
    expires: (d: number) => `La licence expire dans ${d} jour(s) — contactez votre fournisseur`, from: (n: string) => `Message de ${n}`, ok: "OK", provider: "votre fournisseur",
  },
  ar: {
    title: "تفعيل Ultra TV Pro", give: "أعطِ هذا الرمز لمزوّدك لتفعيل التطبيق:", expired: "انتهت صلاحية ترخيصك.",
    trialOver: "انتهت الفترة التجريبية المجانية.", suspended: "هذا الجهاز موقوف. يرجى التواصل مع مزوّدك.",
    offline: "لا يوجد اتصال بخادم التفعيل. تحقّق من اتصالك بالإنترنت.", again: "تحقّق مجددًا", checking: "جارٍ التحقق…",
    contact: "التواصل مع الدعم", trial: (d: number, c: string) => `تجربة مجانية: ${d} يوم متبقٍ · الرمز ${c}`,
    expires: (d: number) => `ينتهي الترخيص خلال ${d} يوم — تواصل مع مزوّدك للتجديد`, from: (n: string) => `رسالة من ${n}`, ok: "حسنًا", provider: "مزوّدك",
  },
};
function useStr() {
  const lang = usePrefs((s) => s.lang);
  return lang === "fr" ? STR.fr : lang === "ar" ? STR.ar : STR.en;
}

export function openExternal(url: string) {
  const b = bridge();
  if (b?.openExternal) void b.openExternal(url);
  else window.open(url, "_blank", "noopener");
}

function Blocked({ s }: { s: Extract<State, { kind: "blocked" }> }) {
  const t = useStr();
  const checking = useLicense((x) => x.checking);
  const p = s.p;
  const reason = !p && s.offline ? t.offline
    : p?.status === "suspended" ? t.suspended
    : p?.status === "expired" ? (p.reseller ? t.expired : t.trialOver)
    : s.offline ? t.offline : null;
  const link = supportLink(p);
  return (
    <div className="lic-gate">
      <div className="lic-card">
        <h1>{t.title}</h1>
        {reason && <p className="lic-reason">{reason}</p>}
        <p className="muted">{t.give}</p>
        <div className="lic-code">{s.code || "—"}</div>
        {p?.reseller && <p className="muted">{p.reseller.name}{p.reseller.text ? ` · ${p.reseller.text}` : ""}</p>}
        <div className="lic-actions">
          <button className="btn primary" onClick={() => void checkLicense()} disabled={checking}>{checking ? t.checking : t.again}</button>
          {link && <button className="btn" onClick={() => openExternal(link)}>{t.contact}</button>}
        </div>
      </div>
    </div>
  );
}

function Banner({ p }: { p: LicensePayload }) {
  const t = useStr();
  const d = daysLeft(p);
  if (d == null) return null;
  const text = p.status === "trial" ? t.trial(d, p.code) : p.status === "active" && d <= 15 ? t.expires(d) : null;
  if (!text) return null;
  const link = supportLink(p);
  return <div className="banner lic-banner" role="status">{text}{link && <button className="btn sm" onClick={() => openExternal(link)}>{t.contact}</button>}</div>;
}

function AnnouncementModal({ a, from }: { a: Announcement; from: string | null }) {
  const t = useStr();
  const lang = usePrefs((s) => s.lang);
  const txt = announcementText(a, from, lang);
  const dismiss = useCallback(() => noteRead(a), [a]);
  return (
    <div className="scrim">
      <div className="modal lic-msg" role="dialog" aria-label={txt.title}>
        <div className="muted">{t.from(from ?? t.provider)}</div>
        <h3>{txt.title}</h3>
        <p className="lic-body">{txt.body}</p>
        <button className="btn primary" autoFocus onClick={dismiss}>{t.ok}</button>
      </div>
    </div>
  );
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const state = useLicense((s) => s.state);
  const unread = useLicense((s) => s.unread);
  const [ready, setReady] = useState(!IS_PRO);
  useEffect(() => { if (IS_PRO) { start(); setReady(true); } }, []);
  if (!IS_PRO) return <>{children}</>;
  if (!ready || state.kind === "loading") return <div className="app no-rail" />;
  if (state.kind === "blocked") return <Blocked s={state} />;
  return (
    <div className="lic-wrap">
      <Banner p={state.p} />
      <div className="lic-content">{children}</div>
      {unread[0] && <AnnouncementModal a={unread[0]} from={state.p.reseller?.name ?? null} />}
    </div>
  );
}
