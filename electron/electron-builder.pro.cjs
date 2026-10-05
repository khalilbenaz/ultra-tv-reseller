// Édition Pro (variante revendeur) : même application, identité séparée.
//  - identifiant, nom et dossier de données propres : s'installe à côté de l'app publique, sans rien partager ;
//  - mises à jour depuis le dépôt de distribution khalilbenaz/ultra-tv-pro (releases vX.Y.Z) ;
//  - web compilé avec VITE_EDITION=pro (porte de licence).
// Utilisation : electron-builder -c electron-builder.pro.cjs --win nsis --x64
const base = require("./package.json").build;

module.exports = {
  ...base,
  appId: "com.ultratv.pro",
  productName: "Ultra TV Pro",
  artifactName: "UltraTVPro-${version}-${os}-${arch}.${ext}",
  dmg: { ...(base.dmg || {}), title: "Ultra TV Pro ${version}" },
  publish: [{ provider: "github", owner: "khalilbenaz", repo: "ultra-tv-pro", releaseType: "draft" }],
  extraMetadata: { name: "ultratv-pro", productName: "Ultra TV Pro", ultratvEdition: "pro" },
};
