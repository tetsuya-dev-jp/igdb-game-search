#!/usr/bin/env bash
# Build the plugin and deploy it into the e2e test vault, then register the
# vault in ~/.config/obsidian/obsidian.json so the app opens it directly.
set -euo pipefail
cd "$(dirname "$0")/.."

VAULT_DIR="e2e/.vault"
PLUGIN_DIR="$VAULT_DIR/.obsidian/plugins/igdb-game-search"
# Fixed UUID so re-runs replace the same entry instead of multiplying them.
VAULT_UUID="9a023e2e-0000-4000-8000-000000000023"

pnpm build

mkdir -p "$PLUGIN_DIR"
cp main.js manifest.json styles.css "$PLUGIN_DIR/"
printf '["igdb-game-search"]\n' > "$VAULT_DIR/.obsidian/community-plugins.json"
# Throwaway vault: start from default settings on every run.
rm -f "$PLUGIN_DIR/data.json"

# Register (or refresh) the vault in obsidian.json, preserving other vaults.
CONFIG_FILE="$HOME/.config/obsidian/obsidian.json"
mkdir -p "$(dirname "$CONFIG_FILE")"
[[ -f "$CONFIG_FILE" ]] || printf '{}\n' > "$CONFIG_FILE"

VAULT_PATH="$(pwd)/$VAULT_DIR"
node -e '
const fs = require("fs");
const [configFile, uuid, vaultPath] = process.argv.slice(1);
const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
cfg.vaults = cfg.vaults || {};
cfg.vaults[uuid] = { path: vaultPath, ts: Date.now(), open: true };
fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
' "$CONFIG_FILE" "$VAULT_UUID" "$VAULT_PATH"

echo "Vault ready: $VAULT_PATH"
