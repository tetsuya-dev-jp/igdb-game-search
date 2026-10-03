#!/usr/bin/env bash
# Isolated Obsidian E2E: never stop or alter the user's personal instance.
set -euo pipefail
cd "$(dirname "$0")/.."
export E2E_CDP_PORT="${E2E_CDP_PORT:-9222}"
export E2E_VAULT_DIR="${E2E_VAULT_DIR:-e2e/.vault}"
export E2E_VAULT_NAME="${E2E_VAULT_NAME:-$(basename "$E2E_VAULT_DIR")}"
export E2E_SHOTS="${E2E_SHOTS:-0}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/igdb-e2e-run.XXXXXXXX")"
export E2E_CONFIG_DIR="$WORK/config"
OBSIDIAN_BIN="$(bash e2e/download-obsidian.sh)"
bash e2e/setup-vault.sh
bash e2e/setup-templater.sh
APP_PID=''
cleanup() {
  if [[ -n "$APP_PID" ]]; then
    kill -- -"$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  # Only this invocation's temporary profile/logs, never the test vault.
  rm -rf -- "$WORK"
}
trap cleanup EXIT
# A private process group allows cleanup without global pkill or singleton
# file deletion. Native desktop runs use the same isolated user-data profile.
if [[ "${E2E_DESKTOP:-0}" == "1" ]]; then
  setsid "$OBSIDIAN_BIN" --no-sandbox --disable-gpu \
    --user-data-dir="$E2E_CONFIG_DIR" --remote-debugging-port="$E2E_CDP_PORT" \
    "$(realpath "$E2E_VAULT_DIR")" > "$WORK/obsidian.log" 2>&1 &
else
  setsid xvfb-run -a -s '-screen 0 1440x1000x24' "$OBSIDIAN_BIN" \
    --no-sandbox --disable-gpu --user-data-dir="$E2E_CONFIG_DIR" \
    --remote-debugging-port="$E2E_CDP_PORT" "$(realpath "$E2E_VAULT_DIR")" \
    > "$WORK/obsidian.log" 2>&1 &
fi
APP_PID=$!
node e2e/driver.mjs
node e2e/settings-probe.mjs
node e2e/enrichment-probe.mjs
node e2e/templater-probe.mjs
node e2e/automatic-time-probe.mjs
