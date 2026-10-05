// Édition Pro : abonnement IPTV configuré par le revendeur (saisie du code de l'écran dans son panneau).
// Le Worker revendeur renvoie l'abonnement du client ; on crée / met à jour / retire la source correspondante.
// Une source gérée par le revendeur porte `resellerSourceId` ; les sources ajoutées par l'utilisateur ne sont jamais touchées.

import { deleteSource, emptySource, listSources, saveSource } from "@/db/sources";
import type { Source } from "@/db/types";
import { usePrefs } from "@/state/prefs";
import { useSync } from "@/state/sync";

export interface ResellerSource {
  id: string;
  kind: "xtream" | "m3u";
  name: string;
  updatedAt: number;
  server?: string;
  username?: string;
  password?: string;
  url?: string;
}

/** Plan pur (testable) : sources à créer, mettre à jour ou retirer. */
export function planResellerSources(local: Source[], remote: ResellerSource[]) {
  const managed = local.filter((s) => s.resellerSourceId);
  const add = remote.filter((r) => !managed.some((s) => s.resellerSourceId === r.id));
  const update = remote.flatMap((r) => {
    const s = managed.find((x) => x.resellerSourceId === r.id);
    return s && (s.resellerUpdatedAt ?? 0) < r.updatedAt ? [{ source: s, remote: r }] : [];
  });
  const remove = managed.filter((s) => !remote.some((r) => r.id === s.resellerSourceId));
  return { add, update, remove };
}

function apply(base: Source, r: ResellerSource): Source {
  const xt = r.kind === "xtream";
  return {
    ...base,
    name: r.name, type: xt ? "xtream" : "m3u",
    server: xt ? r.server ?? "" : "", username: xt ? r.username ?? "" : "", password: xt ? r.password ?? "" : "",
    m3uUrl: xt ? "" : r.url ?? "",
    resellerSourceId: r.id, resellerUpdatedAt: r.updatedAt,
  };
}

async function sync(s: Source) {
  while (useSync.getState().running) await new Promise((res) => setTimeout(res, 500));
  await useSync.getState().start(s, { silent: true });
}

/** Applique l'abonnement du revendeur. Renvoie true si quelque chose a changé. */
export async function applyResellerSources(remote: ResellerSource[]): Promise<boolean> {
  const local = await listSources();
  const plan = planResellerSources(local, remote);
  for (const s of plan.remove) await deleteSource(s.id!);
  const toSync: Source[] = [];
  for (const r of plan.add) {
    const s = apply(emptySource(), r);
    const id = await saveSource(s);
    toSync.push({ ...s, id });
    // Première source de l'appareil : elle devient active (l'assistant de bienvenue est sauté).
    if (local.length === 0) usePrefs.getState().set({ activeSourceId: id });
  }
  for (const { source, remote: r } of plan.update) {
    const s = apply(source, r);
    await saveSource(s);
    toSync.push(s);
  }
  if (plan.add.length && location.hash.startsWith("#/welcome")) location.hash = "#/";
  for (const s of toSync) void sync(s);
  return plan.add.length + plan.update.length + plan.remove.length > 0;
}
