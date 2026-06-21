#!/usr/bin/env bash
# Install the `thiny` CLI. Works two ways:
#   curl -fsSL <raw-url>/install.sh | bash     # clones the repo, then installs
#   ./install.sh                               # from inside a clone, just links
set -euo pipefail

REPO_URL="https://github.com/ESES-Labs/thinyai-walrus.git"
SRC_DIR="${THINY_HOME:-$HOME/.thiny}/src"

# Resolve the repo: use this script's dir if it's a clone, else clone fresh.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd || true)"
if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/bin/thiny.mjs" ]; then
  REPO="$SELF_DIR"
else
  echo "==> Cloning $REPO_URL -> $SRC_DIR"
  mkdir -p "$(dirname "$SRC_DIR")"
  if [ -d "$SRC_DIR/.git" ]; then git -C "$SRC_DIR" pull --ff-only; else git clone --depth 1 "$REPO_URL" "$SRC_DIR"; fi
  REPO="$SRC_DIR"
fi

command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required: https://pnpm.io/installation"; exit 1; }

if [ ! -d "$REPO/node_modules" ]; then
  echo "==> pnpm install"
  (cd "$REPO" && pnpm install --frozen-lockfile || pnpm install)
fi

chmod +x "$REPO/bin/thiny.mjs"

# Pick a writable bin dir on PATH (no sudo first).
for d in "$HOME/.local/bin" "/usr/local/bin"; do
  if [ -d "$d" ] && [ -w "$d" ]; then BIN_DIR="$d"; break; fi
done
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN_DIR"
ln -sf "$REPO/bin/thiny.mjs" "$BIN_DIR/thiny"
echo "==> Linked $BIN_DIR/thiny"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "   Add to PATH:  export PATH=\"$BIN_DIR:\$PATH\"";;
esac

echo ""
echo "Done. Next:"
echo "  thiny init     # create ~/.thiny/.env"
echo "  thiny          # start the agent"
