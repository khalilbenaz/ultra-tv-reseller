// Édition Pro : « Abonnement » — validité de l'application (licence) et informations du compte IPTV de la source active.

import { useEffect, useState } from "react";
import { IS_PRO } from "@/edition";
import { checkLicense, openExternal, useLicense } from "@/license/Gate";
import { daysLeft, supportLink } from "@/license/logic";
import { handshake, type XtreamHandshake } from "@/net/xtream";
import { currentTransport } from "@/net/transport";
import { credsOf } from "@/sync/core";
import { usePrefs } from "@/state/prefs";
import { useActiveSource } from "@/state/sources";

const STR = {
  en: {
    title: "Subscription", sub: "Validity of Ultra TV Pro and of your IPTV subscription.",
    lic: "Ultra TV Pro license", status: "Status", validUntil: "Valid until", left: "Days left", code: "Device code", provider: "Provider",
    check: "Check now", checking: "Checking…", contact: "Contact support",
    st: { trial: "Free trial", active: "Active", expired: "Expired", suspended: "Suspended" } as Record<string, string>,
    iptv: "IPTV subscription", source: "Source", accStatus: "Account status", expires: "Expires", conns: "Connections", server: "Server",
    created: "Created", never: "No expiry", unknown: "Unknown", refresh: "Refresh", m3u: "M3U playlists do not provide subscription details.",
    noSource: "No source configured.", offline: "Could not reach the provider; last known values are shown.", formats: "Formats",
  },
  fr: {
    title: "Abonnement", sub: "Validité d'Ultra TV Pro et de votre abonnement IPTV.",
    lic: "Licence Ultra TV Pro", status: "Statut", validUntil: "Valide jusqu'au", left: "Jours restants", code: "Code de l'appareil", provider: "Fournisseur",
    check: "Vérifier maintenant", checking: "Vérification…", contact: "Contacter le support",
    st: { trial: "Essai gratuit", active: "Active", expired: "Expirée", suspended: "Suspendue" } as Record<string, string>,
    iptv: "Abonnement IPTV", source: "Source", accStatus: "État du compte", expires: "Expire le", conns: "Connexions", server: "Serveur",
    created: "Créé le", never: "Sans expiration", unknown: "Inconnu", refresh: "Actualiser", m3u: "Les listes M3U ne fournissent pas d'informations d'abonnement.",
    noSource: "Aucune source configurée.", offline: "Fournisseur injoignable : dernières valeurs connues.", formats: "Formats",
  },
  ar: {
    title: "الاشتراك", sub: "صلاحية Ultra TV Pro واشتراك IPTV الخاص بك.",
    lic: "ترخيص Ultra TV Pro", status: "الحالة", validUntil: "صالح حتى", left: "الأيام المتبقية", code: "رمز الجهاز", provider: "المزوّد",
    check: "تحقّق الآن", checking: "جارٍ التحقق…", contact: "التواصل مع الدعم",
    st: { trial: "تجربة مجانية", active: "نشط", expired: "منتهٍ", suspended: "موقوف" } as Record<string, string>,
    iptv: "اشتراك IPTV", source: "المصدر", accStatus: "حالة الحساب", expires: "ينتهي في", conns: "الاتصالات", server: "الخادم",
    created: "أُنشئ في", never: "بدون انتهاء", unknown: "غير معروف", refresh: "تحديث", m3u: "قوائم M3U لا توفّر معلومات الاشتراك.",
    noSource: "لا يوجد مصدر.", offline: "تعذّر الوصول إلى المزوّد: آخر القيم المعروفة.", formats: "الصيغ",
  },
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="acc-row"><span className="muted">{k}</span><span>{v}</span></div>;
}

export function Account() {
  const lang = usePrefs((s) => s.lang);
  const t = lang === "fr" ? STR.fr : lang === "ar" ? STR.ar : STR.en;
  const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }) : "—");
  const lic = useLicense((s) => s.state);
  const checking = useLicense((s) => s.checking);
  const p = lic.kind === "allowed" || lic.kind === "blocked" ? lic.p : null;
  const source = useActiveSource();
  const [info, setInfo] = useState<XtreamHandshake["user_info"] | null>(null);
  const [srv, setSrv] = useState<XtreamHandshake["server_info"] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadIptv = async () => {
    if (!source || source.type !== "xtream") return;
    setBusy(true);
    try {
      const h = await handshake(await currentTransport(), credsOf(source));
      setInfo(h.user_info ?? null); setSrv(h.server_info ?? null); setFailed(false);
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  useEffect(() => { void loadIptv(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [source?.id]);

  const exp = info?.exp_date ? Number(info.exp_date) * 1000 : source?.expDate ?? null;
  const iptvDays = exp ? Math.max(0, Math.ceil((exp - Date.now()) / 86_400_000)) : null;
  const status = info?.status ?? null;
  const link = supportLink(p);
  const days = daysLeft(p);
  const licClass = p?.status === "active" || p?.status === "trial" ? "ok" : "bad";

  return (
    <div className="page">
      <div className="page-head"><div><h1>{t.title}</h1><div className="sub">{t.sub}</div></div></div>
      <div className="acc-grid">
        {IS_PRO && (
          <section className="acc-card">
            <h2>{t.lic} <span className="pro-badge">PRO</span></h2>
            <Row k={t.status} v={<span className={`acc-pill ${licClass}`}>{p ? t.st[p.status] ?? p.status : t.unknown}</span>} />
            <Row k={t.validUntil} v={fmt(p?.until)} />
            <Row k={t.left} v={days ?? "—"} />
            <Row k={t.code} v={<span className="mono">{p?.code ?? "—"}</span>} />
            {p?.reseller && <Row k={t.provider} v={p.reseller.name + (p.reseller.text ? ` · ${p.reseller.text}` : "")} />}
            <div className="acc-actions">
              <button className="btn" disabled={checking} onClick={() => void checkLicense()}>{checking ? t.checking : t.check}</button>
              {link && <button className="btn primary" onClick={() => openExternal(link)}>{t.contact}</button>}
            </div>
          </section>
        )}
        <section className="acc-card">
          <h2>{t.iptv}</h2>
          {!source ? <p className="muted">{t.noSource}</p> : (
            <>
              <Row k={t.source} v={source.name} />
              {source.type === "m3u" ? <p className="muted">{t.m3u}</p> : (
                <>
                  <Row k={t.accStatus} v={<span className={`acc-pill ${status === "Active" ? "ok" : status ? "bad" : ""}`}>{status ?? t.unknown}</span>} />
                  <Row k={t.expires} v={exp ? `${fmt(exp)}${iptvDays != null ? ` · ${iptvDays} ${lang === "fr" ? "j" : lang === "ar" ? "ي" : "d"}` : ""}` : info ? t.never : "—"} />
                  <Row k={t.conns} v={info ? `${Number(info.active_cons ?? 0)} / ${Number(info.max_connections ?? source.maxConnections ?? 1)}` : `— / ${source.maxConnections ?? 1}`} />
                  {info?.allowed_output_formats?.length ? <Row k={t.formats} v={info.allowed_output_formats.join(", ")} /> : null}
                  {srv?.url && <Row k={t.server} v={<span className="mono">{srv.url}{srv.port ? `:${srv.port}` : ""}</span>} />}
                  {failed && <p className="muted">{t.offline}</p>}
                  <div className="acc-actions"><button className="btn" disabled={busy} onClick={() => void loadIptv()}>{busy ? t.checking : t.refresh}</button></div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
