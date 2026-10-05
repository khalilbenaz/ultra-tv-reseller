"use strict";
// Mise a jour automatique via electron-updater (GitHub Releases).
//
// Etats envoyes au renderer : { state, version?, percent?, message? } avec state
// dans checking | available | not-available | downloading | downloaded |
// unavailable | error. "unavailable" couvre : mode dev, application non signee
// sur macOS (Squirrel.Mac refuse d'installer une mise a jour non signee), absence
// de metadonnees de publication. Rien ne plante : tout est dans des try/catch.

const { execFile } = require("node:child_process");
const path = require("node:path");

function macAppBundle() {
  // .../Ultra TV.app/Contents/MacOS/Ultra TV -> .../Ultra TV.app
  return path.resolve(process.execPath, "..", "..", "..");
}

function isMacSigned() {
  return new Promise((resolve) => {
    execFile("codesign", ["-dvv", macAppBundle()], { timeout: 8000 }, (err, _out, stderr) => {
      if (err) return resolve(false);
      // Signature ad hoc ou sans equipe => pas de mise a jour possible.
      const team = /TeamIdentifier=(.+)/.exec(stderr || "");
      resolve(!!team && team[1].trim() !== "not set");
    });
  });
}

// Édition standard : releases « desktop-vX.Y.Z » du dépôt public. Édition Pro : releases « vX.Y.Z » du dépôt de
// distribution séparé (jamais l'application publique).
const SOURCES = {
  standard: { repo: "khalilbenaz/ultra-tv", prefix: "desktop-v" },
  pro: { repo: "khalilbenaz/ultra-tv-pro", prefix: "v" },
};

// La release GitHub "Latest" est celle de l'application Android (vX.Y.Z), sans latest.yml :
// le fournisseur GitHub d'electron-updater ne trouvait donc jamais la version de bureau.
// On cherche la release de bureau publiee la plus recente (desktop-vX.Y.Z) et on pointe dessus.
// Exporte pour les tests.
function pickDesktopTag(releases, prefix = "desktop-v") {
  const ok = (t) => typeof t === "string" && t.startsWith(prefix) && /^\d+\.\d+\.\d+$/.test(t.slice(prefix.length));
  const tags = (Array.isArray(releases) ? releases : [])
    .filter((r) => r && !r.draft && !r.prerelease && ok(r.tag_name))
    .map((r) => r.tag_name);
  const num = (t) => t.slice(prefix.length).split(".").map(Number);
  tags.sort((a, b) => {
    const x = num(a), y = num(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  });
  return tags[0] || null;
}

async function latestDesktopTag({ repo, prefix }) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=50`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "UltraTV-Updater" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  return pickDesktopTag(await res.json(), prefix);
}

function createUpdater({ app, send, edition = "standard" }) {
  const source = SOURCES[edition] || SOURCES.standard;
  let autoUpdater = null;
  let last = { state: "unavailable", message: "not-initialised" };
  let initPromise = null;

  function publish(status) {
    last = status;
    try {
      send(status);
    } catch {
      /* fenetre fermee */
    }
  }

  async function init() {
    if (!app.isPackaged) {
      publish({ state: "unavailable", message: "dev" });
      return false;
    }
    if (process.platform === "darwin" && !(await isMacSigned())) {
      publish({ state: "unavailable", message: "unsigned" });
      return false;
    }
    try {
      ({ autoUpdater } = require("electron-updater"));
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowPrerelease = false;
      autoUpdater.on("checking-for-update", () => publish({ state: "checking" }));
      autoUpdater.on("update-available", (i) => publish({ state: "available", version: i && i.version }));
      autoUpdater.on("update-not-available", () => publish({ state: "not-available" }));
      autoUpdater.on("download-progress", (p) =>
        publish({ state: "downloading", percent: Math.round((p && p.percent) || 0) }),
      );
      autoUpdater.on("update-downloaded", (i) => publish({ state: "downloaded", version: i && i.version }));
      autoUpdater.on("error", () => publish({ state: "error", message: "update-failed" }));
      return true;
    } catch {
      autoUpdater = null;
      publish({ state: "unavailable", message: "updater-missing" });
      return false;
    }
  }

  async function check() {
    if (!initPromise) initPromise = init();
    const ok = await initPromise;
    if (!ok || !autoUpdater) return last;
    try {
      const tag = await latestDesktopTag(source);
      if (!tag) {
        publish({ state: "not-available" });
        return last;
      }
      autoUpdater.setFeedURL({ provider: "generic", url: `https://github.com/${source.repo}/releases/download/${tag}` });
      await autoUpdater.checkForUpdates();
    } catch {
      publish({ state: "error", message: "update-failed" });
    }
    return last;
  }

  // Installation immediate d'une mise a jour deja telechargee (silencieuse, relance l'application).
  function install() {
    if (!autoUpdater || last.state !== "downloaded") return false;
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  }

  return { check, install, status: () => last };
}

module.exports = { createUpdater, pickDesktopTag };
