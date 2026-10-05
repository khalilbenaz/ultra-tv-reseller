#!/usr/bin/env bash
# Publie une version de l'édition Pro dans le dépôt de distribution public khalilbenaz/ultra-tv-pro.
# Usage : scripts/publish-pro.sh <run-id du workflow « Pro release »>
# Récupère les artefacts du dépôt privé, vérifie les sommes SHA-256 des APK, crée la release vX.Y.Z (= VERSION).
set -euo pipefail
RUN="${1:?run id du workflow Pro release}"
PRIVATE=khalilbenaz/ultra-tv-reseller
DIST=khalilbenaz/ultra-tv-pro
V=$(cat "$(dirname "$0")/../VERSION" | tr -d '[:space:]')
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
gh run download "$RUN" -R "$PRIVATE" -D "$WORK"
mkdir -p "$WORK/out"
find "$WORK" -mindepth 2 -type f -not -path "$WORK/out/*" -exec cp {} "$WORK/out/" \;
cd "$WORK/out"
sha256sum -c SHA256SUMS.txt
# latest-mac.yml / latest.yml / latest-linux.yml : un par plateforme, tous nécessaires aux mises à jour.
ls -la
NOTES="Ultra TV Pro $V — media player (reseller edition). No content is included. See SHA256SUMS.txt for checksums."
if gh release view "v$V" -R "$DIST" >/dev/null 2>&1; then
  gh release upload "v$V" -R "$DIST" --clobber ./*
else
  gh release create "v$V" -R "$DIST" --title "Ultra TV Pro $V" --notes "$NOTES" --latest ./*
fi
gh release view "v$V" -R "$DIST" --json url -q .url
