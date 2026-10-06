import { describe, expect, it } from "vitest";
import { emptySource } from "@/db/sources";
import { shareInput } from "@/cloud/service";
import { LICENSE_REPORT_EVERY_MS, licenseReportDue } from "./cloudReport";

describe("statut de licence vers le tableau de bord du compte", () => {
  const T = 1_000_000_000;
  it("premier envoi, puis seulement si le statut change ou après 24 h", () => {
    expect(licenseReportDue("", 0, "sigA", T)).toBe(true);
    expect(licenseReportDue("sigA", T, "sigA", T + 3600_000)).toBe(false);
    expect(licenseReportDue("sigA", T, "sigB", T + 1)).toBe(true);
    expect(licenseReportDue("sigA", T, "sigA", T + LICENSE_REPORT_EVERY_MS)).toBe(true);
  });
  it("horloge reculée depuis le dernier envoi : renvoi", () => {
    expect(licenseReportDue("sigA", T, "sigA", T - 1)).toBe(true);
  });
  it("aucun statut signé : rien à envoyer", () => {
    expect(licenseReportDue("", 0, "", T)).toBe(false);
  });
});

describe("source partagée vers le compte", () => {
  it("source du revendeur : managed = reseller ; source de l'utilisateur : pas de marque", () => {
    const mine = { ...emptySource(), id: 1, type: "xtream" as const, name: "Perso", server: "http://x", username: "u", password: "p" };
    const reseller = { ...mine, id: 2, resellerSourceId: "cs-a", resellerUpdatedAt: 1 };
    expect(shareInput(reseller, "all").managed).toBe("reseller");
    expect(shareInput(mine, "all").managed).toBeUndefined();
    expect(JSON.stringify(shareInput(mine, "all"))).not.toContain("managed");
  });
});
