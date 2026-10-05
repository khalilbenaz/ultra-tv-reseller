import { describe, expect, it } from "vitest";
import { emptySource } from "@/db/sources";
import { planResellerSources, type ResellerSource } from "./provision";

const r = (id: string, updatedAt: number): ResellerSource => ({ id, kind: "xtream", name: "TV", updatedAt, server: "http://x", username: "u", password: "p" });

describe("abonnement du revendeur", () => {
  it("ajoute, met à jour si plus récent, retire ; ne touche jamais aux sources de l'utilisateur", () => {
    const mine = { ...emptySource(), id: 1, name: "Perso" };
    const managed = { ...emptySource(), id: 2, resellerSourceId: "cs-a", resellerUpdatedAt: 100 };
    const stale = { ...emptySource(), id: 3, resellerSourceId: "cs-old", resellerUpdatedAt: 50 };
    const plan = planResellerSources([mine, managed, stale], [r("cs-a", 200), r("cs-new", 10)]);
    expect(plan.add.map((x) => x.id)).toEqual(["cs-new"]);
    expect(plan.update.map((x) => x.source.id)).toEqual([2]);
    expect(plan.remove.map((x) => x.id)).toEqual([3]);
  });
  it("même version : rien à faire", () => {
    const managed = { ...emptySource(), id: 2, resellerSourceId: "cs-a", resellerUpdatedAt: 200 };
    expect(planResellerSources([managed], [r("cs-a", 200)])).toEqual({ add: [], update: [], remove: [] });
  });
});
