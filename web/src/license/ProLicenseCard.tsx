// Édition Pro : carte « Licence Ultra TV Pro » de la page Abonnement (validité de l'application).

import { usePrefs } from "@/state/prefs";
import { AccountRow } from "@/screens/Account";
import { useEffect, useState } from "react";
import { announcementTag, announcementText, checkLicense, noteRead, openExternal, useLicense } from "./Gate";
import { fetchInbox, type Announcement } from "./client";
import { daysLeft, supportLink } from "./logic";

const STR = {
  en: { devices: "Devices", messages: "Messages", none: "No message from your provider.", lic: "Ultra TV Pro license", status: "Status", until: "Valid until", left: "Days left", code: "Device code", provider: "Provider", check: "Check now", checking: "Checking…", contact: "Contact support", unknown: "Unknown",
    st: { trial: "Free trial", active: "Active", expired: "Expired", suspended: "Suspended" } as Record<string, string> },
  fr: { devices: "Appareils", messages: "Messages", none: "Aucun message de votre fournisseur.", lic: "Licence Ultra TV Pro", status: "Statut", until: "Valide jusqu'au", left: "Jours restants", code: "Code de l'appareil", provider: "Fournisseur", check: "Vérifier maintenant", checking: "Vérification…", contact: "Contacter le support", unknown: "Inconnu",
    st: { trial: "Essai gratuit", active: "Active", expired: "Expirée", suspended: "Suspendue" } as Record<string, string> },
  ar: { devices: "الأجهزة", messages: "الرسائل", none: "لا توجد رسائل من مزوّدك.", lic: "ترخيص Ultra TV Pro", status: "الحالة", until: "صالح حتى", left: "الأيام المتبقية", code: "رمز الجهاز", provider: "المزوّد", check: "تحقّق الآن", checking: "جارٍ التحقق…", contact: "التواصل مع الدعم", unknown: "غير معروف",
    st: { trial: "تجربة مجانية", active: "نشط", expired: "منتهٍ", suspended: "موقوف" } as Record<string, string> },
};

export function ProLicenseCard() {
  const lang = usePrefs((s) => s.lang);
  const t = lang === "fr" ? STR.fr : lang === "ar" ? STR.ar : STR.en;
  const lic = useLicense((s) => s.state);
  const checking = useLicense((s) => s.checking);
  const p = lic.kind === "allowed" || lic.kind === "blocked" ? lic.p : null;
  const link = supportLink(p);
  const days = daysLeft(p);
  const ok = p?.status === "active" || p?.status === "trial";
  const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }) : "—");
  return (
    <section className="acc-card">
      <h2>{t.lic} <span className="pro-badge">PRO</span></h2>
      <AccountRow k={t.status} v={<span className={`acc-pill ${ok ? "ok" : "bad"}`}>{p ? t.st[p.status] ?? p.status : t.unknown}</span>} />
      <AccountRow k={t.until} v={fmt(p?.until)} />
      <AccountRow k={t.left} v={days ?? "—"} />
      <AccountRow k={t.code} v={<span className="mono">{p?.code ?? "—"}</span>} />
      {p?.devices && <AccountRow k={t.devices} v={`${p.devices.used} / ${p.devices.max}`} />}
      {p?.reseller && <AccountRow k={t.provider} v={p.reseller.name + (p.reseller.text ? ` · ${p.reseller.text}` : "")} />}
      <div className="acc-actions">
        <button className="btn" disabled={checking} onClick={() => void checkLicense()}>{checking ? t.checking : t.check}</button>
        {link && <button className="btn primary" onClick={() => openExternal(link)}>{t.contact}</button>}
      </div>
    </section>
  );
}

/** Boîte de réception (édition Pro) : annonces du revendeur et rappels, relisibles ; ouvrir un message le marque lu. */
export function ProInboxCard() {
  const lang = usePrefs((s) => s.lang);
  const t = lang === "fr" ? STR.fr : lang === "ar" ? STR.ar : STR.en;
  const lic = useLicense((s) => s.state);
  const count = useLicense((s) => s.inboxCount);
  const from = lic.kind === "allowed" ? lic.p.reseller?.name ?? null : null;
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { void fetchInbox().then(setItems); }, [count]);
  if (lic.kind !== "allowed") return null;
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
  return (
    <section className="acc-card inbox-card">
      <h2>{t.messages}{count > 0 && <span className="inbox-count">{count}</span>}</h2>
      {items && !items.length && <p className="muted">{t.none}</p>}
      {(items ?? []).map((a) => {
        const txt = announcementText(a, from, lang);
        const tag = announcementTag(a, lang);
        const expanded = open === a.id;
        return (
          <button key={a.id} className={`inbox-item${a.read ? "" : " unread"}${expanded ? " open" : ""}`}
            onClick={() => { setOpen(expanded ? null : a.id); if (!a.read) { noteRead(a); setItems((l) => (l ?? []).map((m) => (m.id === a.id ? { ...m, read: true } : m))); } }}>
            <span className={`inbox-tag ${tag.key}`}>{tag.label}</span>
            <span className="inbox-head"><b>{txt.title}</b><span className="muted">{fmt(a.at)}</span></span>
            <span className="inbox-body">{txt.body}</span>
          </button>
        );
      })}
    </section>
  );
}
