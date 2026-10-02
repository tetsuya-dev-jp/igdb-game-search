#!/usr/bin/env bash
# Download + extract the latest Obsidian AppImage into e2e/.cache/.
# Prints the resolved binary path on success, exits non-zero on failure.
set -euo pipefail
cd "$(dirname "$0")/.."

CACHE_DIR="${E2E_OBSIDIAN_CACHE:-${TMPDIR:-/tmp}/igdb-e2e-obsidian}"
EXTRACTED_BIN="$CACHE_DIR/squashfs-root/obsidian"

# Cache hit: extracted binary already present (and not forced to redo).
if [[ -x "$EXTRACTED_BIN" && "${1:-}" != "--force" ]]; then
  echo "$EXTRACTED_BIN"
  exit 0
fi

mkdir -p "$CACHE_DIR"

# The newest release may be mobile-only. Choose the newest published release
# that actually ships the desktop x86_64 AppImage. gh uses authenticated API
# quota when available; curl is the dependency-free fallback.
if command -v gh >/dev/null 2>&1; then
  RELEASE_JSON="$(gh api 'repos/obsidianmd/obsidian-releases/releases?per_page=10')"
else
  RELEASE_JSON="$(curl -sfL --retry 3 'https://api.github.com/repos/obsidianmd/obsidian-releases/releases?per_page=10')" || {
    echo "ERROR: failed to resolve Obsidian desktop releases." >&2
    exit 1
  }
fi
ASSET_URL="$(printf '%s' "$RELEASE_JSON" | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  for (const release of JSON.parse(input)) {
    if (release.draft || release.prerelease) continue;
    const asset = release.assets.find(a => /^Obsidian-[\d.]+\.AppImage$/.test(a.name));
    if (asset) { console.log(asset.browser_download_url); return; }
  }
});')"

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
