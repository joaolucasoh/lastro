#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TARGET_DIR="${1:-${LASTRO_INSTALL_DIR:-$HOME/LastroServer}}"
TARGET_APP_DIR="$TARGET_DIR/app"
TARGET_DATA_DIR="${LASTRO_TARGET_DATA_DIR:-$HOME/LastroData}"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale no Mac servidor: brew install node" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm não encontrado. Instale Node.js no Mac servidor." >&2
  exit 1
fi
if ! node -e "require('node:sqlite'); const major = Number(process.versions.node.split('.')[0]); if (major < 22) process.exit(1)" >/dev/null 2>&1; then
  echo "Node.js incompatível. O Lastro precisa de Node 22+ com node:sqlite." >&2
  echo "No Mac servidor, rode: brew update && brew reinstall node" >&2
  echo "Depois confira: node -v && npm -v" >&2
  exit 1
fi
if ! npm --version >/dev/null 2>&1; then
  echo "npm está instalado, mas falhou ao iniciar. Isso costuma ser Node/npm incompatível ou instalação corrompida." >&2
  echo "No Mac servidor, rode: brew update && brew reinstall node" >&2
  echo "Depois abra um terminal novo e confira: node -v && npm -v" >&2
  exit 1
fi
mkdir -p "$TARGET_DIR" "$TARGET_APP_DIR" "$TARGET_DATA_DIR" "$TARGET_DIR/LaunchAgents"
rsync -a --delete --exclude node_modules --exclude .next --exclude .git "$PROJECT_DIR/" "$TARGET_APP_DIR/"
cp "$SCRIPT_DIR/start-server.sh" "$TARGET_DIR/start-server.sh"
cp "$SCRIPT_DIR/lastroctl.sh" "$TARGET_DIR/lastroctl.sh"
cp "$SCRIPT_DIR/install-server.sh" "$TARGET_DIR/install-server.sh"
cp "$SCRIPT_DIR/uninstall-server.sh" "$TARGET_DIR/uninstall-server.sh"
cp "$SCRIPT_DIR/README.md" "$TARGET_DIR/README.md"
cp "$SCRIPT_DIR/LaunchAgents/net.lastro.server.local.plist" "$TARGET_DIR/LaunchAgents/net.lastro.server.local.plist"
if [ ! -f "$TARGET_DIR/.env" ]; then
  cat > "$TARGET_DIR/.env" <<EOF
LASTRO_HOST=${LASTRO_HOST:-127.0.0.1}
LASTRO_PORT=${LASTRO_PORT:-3030}
LASTRO_DATA_DIR=$TARGET_DATA_DIR
EOF
fi
chmod +x "$TARGET_DIR/start-server.sh" "$TARGET_DIR/lastroctl.sh" "$TARGET_DIR/install-server.sh" "$TARGET_DIR/uninstall-server.sh"
cd "$TARGET_APP_DIR"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build
"$TARGET_DIR/lastroctl.sh" install
"$TARGET_DIR/lastroctl.sh" start
echo "Lastro instalado no Mac servidor."
echo "App: $TARGET_APP_DIR"
echo "Dados: $TARGET_DATA_DIR"
echo "Controle: $TARGET_DIR/lastroctl.sh"
echo "URL local: http://127.0.0.1:${LASTRO_PORT:-3030}"
