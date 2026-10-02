#!/usr/bin/env bash
# Install official Templater release assets into the isolated test vault only.
set -euo pipefail
cd "$(dirname "$0")/.."
VAULT_DIR="${E2E_VAULT_DIR:-e2e/.vault}"
TARGET="$VAULT_DIR/.obsidian/plugins/templater-obsidian"
if [[ ! -f "$TARGET/main.js" ]]; then
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/igdb-templater.XXXXXXXX")"
  trap 'rm -rf -- "$WORK"' EXIT
  gh release download --repo SilentVoid13/Templater --pattern templater-obsidian.zip --dir "$WORK"
  mkdir -p "$TARGET"
  unzip -j "$WORK/templater-obsidian.zip" main.js manifest.json styles.css -d "$TARGET"
fi
node -e '
const fs = require("fs");
const root = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(root+"/plugins/templater-obsidian/manifest.json", "utf8"));
if (manifest.id !== "templater-obsidian") throw new Error("Unexpected Templater plugin id");
const file = root+"/community-plugins.json";
const ids = JSON.parse(fs.readFileSync(file,"utf8"));
if (!ids.includes(manifest.id)) ids.push(manifest.id);
fs.writeFileSync(file,JSON.stringify(ids));
console.log(`Templater ${manifest.version} installed in test vault`);
' "$VAULT_DIR/.obsidian"
