#!/usr/bin/env bash
# Publie une version de l'édition Pro dans le dépôt de distribution public khalilbenaz/ultra-tv-pro.
# Usage : scripts/publish-pro.sh <run-id du workflow « Pro release »>
# Récupère les artefacts du dépôt privé, vérifie les sommes SHA-256 des APK, crée la release vX.Y.Z (= VERSION).
#
# Relançable : une release neuve est créée en brouillon, seuls les fichiers absents (ou de taille
# différente) sont envoyés, et elle n'est publiée qu'une fois complète. Un envoi que GitHub a reçu
# mais dont la réponse s'est perdue (HTTP 422 « already exists ») ne bloque plus les fichiers suivants.
set -euo pipefail
RUN="${1:?run id du workflow Pro release}"
PRIVATE=khalilbenaz/ultra-tv-reseller
DIST=khalilbenaz/ultra-tv-pro
V=$(cat "$(dirname "$0")/../VERSION" | tr -d '[:space:]')
TAG="v$V"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
gh run download "$RUN" -R "$PRIVATE" -D "$WORK"
mkdir -p "$WORK/out"
find "$WORK" -mindepth 2 -type f -not -path "$WORK/out/*" -exec cp {} "$WORK/out/" \;
cd "$WORK/out"
sha256sum -c SHA256SUMS.txt
# latest-mac.yml / latest.yml / latest-linux.yml : un par plateforme, tous nécessaires aux mises à jour.
ls -la

# Taille en ligne d'un fichier de la release (vide s'il est absent).
remote_size() {
  gh release view "$TAG" -R "$DIST" --json assets \
    -q ".assets[] | select(.name == \"$1\") | .size"
}

NOTES="Ultra TV Pro $V — media player (reseller edition). No content is included. See SHA256SUMS.txt for checksums."
if ! gh release view "$TAG" -R "$DIST" >/dev/null 2>&1; then
  gh release create "$TAG" -R "$DIST" --draft --title "Ultra TV Pro $V" --notes "$NOTES"
fi

for f in *; do
  want=$(wc -c < "$f" | tr -d '[:space:]')
  for attempt in 1 2 3; do
    have=$(remote_size "$f")
    [ "$have" = "$want" ] && break
    echo "↑ $f (essai $attempt${have:+, taille en ligne $have ≠ $want})"
    gh release upload "$TAG" -R "$DIST" ${have:+--clobber} "$f" || true
  done
  if [ "$(remote_size "$f")" != "$want" ]; then
    echo "✗ $f absent ou incomplet après 3 essais. Relancer le script : il reprend où il s'est arrêté." >&2
    exit 1
  fi
done

# Tous les fichiers sont en ligne : publication (sans effet si la release l'est déjà).
gh release edit "$TAG" -R "$DIST" --draft=false --latest >/dev/null
set -- *
echo "✓ $# fichiers en ligne"
gh release view "$TAG" -R "$DIST" --json url -q .url
