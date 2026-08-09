#!/usr/bin/env bash
# One-command headless E2E smoke test: download Obsidian, deploy the plugin
# into a throwaway vault, launch it under xvfb with CDP, run the driver.
set -euo pipefail
cd "$(dirname "$0")/.."

export E2E_CDP_PORT="${E2E_CDP_PORT:-9222}"
export E2E_VAULT_NAME="${E2E_VAULT_NAME:-.vault}"
export E2E_SHOTS="${E2E_SHOTS:-0}"

OBSIDIAN_BIN="$(bash e2e/download-obsidian.sh)"
bash e2e/setup-vault.sh
mkdir -p e2e/.cache

# Kill any stale instance first. Bracket pattern: pkill -f with a bare
# pattern matches this shell's own command line and kills it.
pkill -9 -f '[s]quashfs-root/obsidian' 2>/dev/null || true

# Stale singleton files make a fresh launch fail or show the vault picker.
rm -f ~/.config/obsidian/DevToolsActivePort \
  ~/.config/obsidian/SingletonLock \
  ~/.config/obsidian/SingletonSocket \
  ~/.config/obsidian/SingletonCookie

xvfb-run -a -s "-screen 0 1280x800x24" "$OBSIDIAN_BIN" \
  --no-sandbox \
  --disable-gpu \
  --remote-debugging-port="${E2E_CDP_PORT}" \
  e2e/.vault > e2e/.cache/obsidian.log 2>&1 &
APP_PID=$!

cleanup() {
  kill "$APP_PID" 2>/dev/null || true
  # kill "$APP_PID" only stops the xvfb-run wrapper; the Obsidian process
  # tree outlives it. Bracket pattern is safe here: the script's own cmdline
  # ("bash e2e/run.sh") does not contain the pattern text.
  pkill -9 -f '[s]quashfs-root/obsidian' 2>/dev/null || true
  wait "$APP_PID" 2>/dev/null || true
}
trap cleanup EXIT

node e2e/driver.mjs
