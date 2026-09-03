#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
SOURCE="$ROOT/Charybdis.rms"
RELEASE="$DIST/Charybdis-v0.1.0.rms"
ARCHIVE="$DIST/Charybdis-v0.1.0.zip"

node "$ROOT/tools/generate-map.mjs" --check
node "$ROOT/tools/validate-rms.mjs"

mkdir -p "$DIST"
cp "$SOURCE" "$RELEASE"
zip -j -X -FS "$ARCHIVE" "$SOURCE"
unzip -t "$ARCHIVE"

printf 'Built %s\n' "$RELEASE"
printf 'Built %s\n' "$ARCHIVE"
