#!/usr/bin/env bash
# Download + extract the latest Obsidian AppImage into e2e/.cache/.
# Prints the resolved binary path on success, exits non-zero on failure.
set -euo pipefail
cd "$(dirname "$0")/.."

CACHE_DIR="e2e/.cache/obsidian"
EXTRACTED_BIN="$CACHE_DIR/squashfs-root/obsidian"

# Cache hit: extracted binary already present (and not forced to redo).
if [[ -x "$EXTRACTED_BIN" && "${1:-}" != "--force" ]]; then
  echo "$EXTRACTED_BIN"
  exit 0
fi

mkdir -p "$CACHE_DIR"

# Resolve the latest release via the GitHub API. Never fall back to a guessed
# version: on rate-limit (HTTP 429) curl -f fails and we exit with the error.
RELEASE_JSON="$(curl -sfL --retry 3 https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest)" || {
  echo "ERROR: failed to resolve the latest Obsidian release from the GitHub API (rate-limited or unreachable)." >&2
  exit 1
}

# Pick the x86_64 AppImage asset (Obsidian-<ver>.AppImage, NOT -arm64).
ASSET_URL="$(printf '%s' "$RELEASE_JSON" \
  | grep -oE '"browser_download_url": "https://[^"]+\.AppImage"' \
  | grep -v 'arm64' \
  | head -1 \
  | sed -E 's/^"browser_download_url": "([^"]+)"$/\1/')"

if [[ -z "$ASSET_URL" ]]; then
  echo "ERROR: no Obsidian-<ver>.AppImage (x86_64) asset found in the latest release." >&2
  exit 1
fi

APPIMAGE="$CACHE_DIR/$(basename "$ASSET_URL")"

if [[ ! -f "$APPIMAGE" ]]; then
  echo "Downloading $ASSET_URL ..." >&2
  curl -fL --retry 3 -o "$APPIMAGE" "$ASSET_URL"
fi
chmod +x "$APPIMAGE"

# If FUSE is available, the AppImage can run directly.
if ldconfig -p | grep -q libfuse.so.2; then
  if timeout 10 "$APPIMAGE" --appimage-version >/dev/null 2>&1; then
    echo "$APPIMAGE"
    exit 0
  fi
  echo "AppImage direct run failed (FUSE probe); extracting instead." >&2
fi

# No FUSE (or direct run failed): extract with --appimage-extract.
(cd "$CACHE_DIR" && "./$(basename "$APPIMAGE")" --appimage-extract >/dev/null)

if [[ ! -x "$EXTRACTED_BIN" ]]; then
  echo "ERROR: --appimage-extract did not produce $EXTRACTED_BIN." >&2
  exit 1
fi

echo "$EXTRACTED_BIN"
