#!/usr/bin/env bash
# Package NotionToRoblox as a Rokit-compatible release zip via Bun compile.
#
# Rokit extracts a binary named after the GitHub repo (NotionToRoblox), then
# exposes it on PATH under the rokit.toml alias (ntn-roblox).
#
# Usage: scripts/package-release.sh <version> <bun-target> <output-dir>
#
# Example (macOS host, local smoke):
#   bash scripts/package-release.sh 0.1.1 bun-darwin-arm64 ./release
#
# Requires: bun on PATH, zip (or Python 3 for fallback)
set -euo pipefail

# Must match the GitHub repository name (Zac134/NotionToRoblox).
ROKIT_BIN_NAME="NotionToRoblox"

usage() {
  echo "Usage: $0 <version> <bun-target> <output-dir>" >&2
  echo "  version     Release version (v prefix optional, e.g. 0.1.1 or v0.1.1)" >&2
  echo "  bun-target  One of: bun-linux-x64, bun-linux-arm64," >&2
  echo "              bun-darwin-x64, bun-darwin-arm64," >&2
  echo "              bun-windows-x64, bun-windows-arm64" >&2
  echo "  output-dir  Directory for NotionToRoblox-{version}-{os}-{arch}.zip" >&2
  exit 1
}

[[ $# -eq 3 ]] || usage

VERSION="${1#v}"
BUN_TARGET="$2"
OUTPUT_DIR="$3"

case "$BUN_TARGET" in
  bun-linux-x64)     OS_ARCH="linux-x86_64" ;;
  bun-linux-arm64)   OS_ARCH="linux-aarch64" ;;
  bun-darwin-x64)    OS_ARCH="macos-x86_64" ;;
  bun-darwin-arm64)  OS_ARCH="macos-aarch64" ;;
  bun-windows-x64)   OS_ARCH="windows-x86_64" ;;
  bun-windows-arm64) OS_ARCH="windows-aarch64" ;;
  *)
    echo "error: unknown bun target: $BUN_TARGET" >&2
    exit 1
    ;;
esac

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is not installed or not on PATH" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p "$OUTPUT_DIR"

if [[ "$BUN_TARGET" == bun-windows-* ]]; then
  BIN_NAME="${ROKIT_BIN_NAME}.exe"
else
  BIN_NAME="$ROKIT_BIN_NAME"
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

BINARY_PATH="$WORK_DIR/$BIN_NAME"

echo "Compiling src/cli.ts for $BUN_TARGET ..."
bun build src/cli.ts --compile --target="$BUN_TARGET" --outfile="$BINARY_PATH"

if [[ "$BIN_NAME" != *.exe ]]; then
  chmod +x "$BINARY_PATH"
fi

ZIP_NAME="${ROKIT_BIN_NAME}-${VERSION}-${OS_ARCH}.zip"
ZIP_PATH="$(cd "$OUTPUT_DIR" && pwd)/$ZIP_NAME"

create_zip() {
  local zip_path="$1"
  local work_dir="$2"
  local bin_name="$3"

  if command -v zip >/dev/null 2>&1; then
    (cd "$work_dir" && zip -j "$zip_path" "$bin_name")
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$zip_path" "$work_dir" "$bin_name" <<'PY'
import sys
import zipfile
from pathlib import Path

zip_path, work_dir, bin_name = sys.argv[1:4]
source = Path(work_dir) / bin_name
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    zf.write(source, arcname=bin_name)
PY
    return
  fi

  echo "error: zip or python3 is required to create release archives" >&2
  exit 1
}

create_zip "$ZIP_PATH" "$WORK_DIR" "$BIN_NAME"
echo "Created $ZIP_PATH"
