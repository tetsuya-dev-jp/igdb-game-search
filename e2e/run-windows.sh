#!/usr/bin/env bash
# Windows E2E runner: drive the REAL desktop Obsidian (the user's own install)
# against a throwaway test vault. The test vault lives on the Windows side
# (AppData\Local\Temp) — never the user's real vault. Requires the user's
# Obsidian to be CLOSED first (Obsidian is single-instance: a running app
# would swallow the launch and ignore the --remote-debugging-port flag).
#
# Prereqs: Windows user "kurok" layout (override via E2E_WIN_USER),
# powershell.exe reachable from WSL, TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET
# set (e.g. sourced from ~/.config/igdb-e2e.env) for test 6.
set -euo pipefail
cd "$(dirname "$0")/.."

E2E_WIN_USER="${E2E_WIN_USER:-kurok}"
WIN_HOME="C:\\Users\\$E2E_WIN_USER"
WIN_VAULT="C:\\Users\\$E2E_WIN_USER\\AppData\\Local\\Temp\\igdb-e2e-vault"
WSL_VAULT="/mnt/c/Users/$E2E_WIN_USER/AppData/Local/Temp/igdb-e2e-vault"
WIN_OBSIDIAN_CFG="C:\\Users\\$E2E_WIN_USER\\AppData\\Roaming\\obsidian\\obsidian.json"
WSL_OBSIDIAN_CFG="/mnt/c/Users/$E2E_WIN_USER/AppData/Roaming/obsidian/obsidian.json"
WIN_OBSIDIAN_DIR="C:\\Users\\$E2E_WIN_USER\\AppData\\Roaming\\obsidian"
WSL_OBSIDIAN_DIR="/mnt/c/Users/$E2E_WIN_USER/AppData/Roaming/obsidian"
OBSIDIAN_EXE='C:\Program Files\Obsidian\Obsidian.exe'
VAULT_UUID="9a023e2e-0000-4000-8000-000000000024"
PORT="${E2E_CDP_PORT:-9222}"
PS="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

cleanup() {
  if [[ -n "${OBS_PID:-}" ]]; then
    "$PS" -NoProfile -Command "Stop-Process -Id $OBS_PID -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true
  fi
  # Remove the test-vault registration (preserving the user's other vaults).
  if [[ -f "$WSL_OBSIDIAN_CFG" ]]; then
    cp "$WSL_OBSIDIAN_CFG" "$WSL_OBSIDIAN_CFG.bak" 2>/dev/null || true
    node -e '
      const fs = require("fs");
      const [configFile, uuid] = process.argv.slice(1);
      const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
      if (cfg.vaults) delete cfg.vaults[uuid];
      fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
    ' "$WSL_OBSIDIAN_CFG" "$VAULT_UUID"
  fi
  rm -rf "$WSL_VAULT"
}
trap cleanup EXIT

# 1. Build + deploy into the Windows-side test vault.
export PATH="$(dirname "$(command -v pnpm 2>/dev/null || echo /tmp/pnpm-bin/pnpm)")":$PATH 2>/dev/null || true
export PATH="/tmp/pnpm-bin:$PATH"
pnpm build >/dev/null
rm -rf "$WSL_VAULT"
mkdir -p "$WSL_VAULT/.obsidian/plugins/igdb-game-search"
cp main.js manifest.json styles.css "$WSL_VAULT/.obsidian/plugins/igdb-game-search/"
printf '["igdb-game-search"]\n' > "$WSL_VAULT/.obsidian/community-plugins.json"
echo "Test vault ready: $WIN_VAULT"

# 2. Make sure the user's Obsidian is not running (single-instance).
if "$PS" -NoProfile -Command "Get-Process Obsidian -ErrorAction SilentlyContinue" | grep -q Obsidian; then
  echo "ERROR: Obsidian is running. Close it first (Ctrl+Q or taskbar), then re-run." >&2
  exit 1
fi

# 3. Register the test vault in the Windows obsidian.json (backup first).
cp "$WSL_OBSIDIAN_CFG" "$WSL_OBSIDIAN_CFG.bak" 2>/dev/null || true
node -e '
  const fs = require("fs");
  const [configFile, uuid, vaultPath, ts] = process.argv.slice(1);
  const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
  cfg.vaults = cfg.vaults || {};
  cfg.vaults[uuid] = { path: vaultPath, ts: Number(ts), open: true };
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
' "$WSL_OBSIDIAN_CFG" "$VAULT_UUID" "$WIN_VAULT" "$(date +%s)"

# 4. Clear stale singleton locks (they block a fresh launch after a crash).
rm -f "$WSL_OBSIDIAN_DIR"/SingletonLock "$WSL_OBSIDIAN_DIR"/SingletonSocket \
      "$WSL_OBSIDIAN_DIR"/SingletonCookie "$WSL_OBSIDIAN_DIR"/DevToolsActivePort

# 5. Launch Obsidian with remote debugging, tracking the PID for cleanup.
OBS_PID="$("$PS" -NoProfile -Command \
  "(Start-Process -FilePath '$OBSIDIAN_EXE' -ArgumentList '--remote-debugging-port=$PORT','$WIN_VAULT' -PassThru).Id" \
  | tr -d '\r' | tail -1)"
echo "Obsidian launched (PID $OBS_PID), waiting for CDP on port $PORT..."

# 6. Wait for the CDP endpoint (WSL localhost forwarding reaches Windows).
for i in $(seq 1 120); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/json/version" 2>/dev/null; then
    break
  fi
  sleep 1
done
curl -s -o /dev/null "http://127.0.0.1:$PORT/json/version" || {
  echo "ERROR: CDP endpoint never came up on port $PORT (Obsidian may have shown a dialog)." >&2
  exit 1
}
echo "CDP up."

# 7. Run the driver — real suggest-modal selection, Windows test-vault name.
E2E_VAULT_NAME="igdb-e2e-vault" E2E_SUGGEST_MODAL=1 E2E_CDP_PORT="$PORT" node e2e/driver.mjs
