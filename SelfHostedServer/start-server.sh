#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR/app"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  . "$SCRIPT_DIR/.env"
  set +a
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
if command -v npm >/dev/null 2>&1; then
  NPM_BIN=$(command -v npm)
elif [ -x /opt/homebrew/bin/npm ]; then
  NPM_BIN=/opt/homebrew/bin/npm
elif [ -x /usr/local/bin/npm ]; then
  NPM_BIN=/usr/local/bin/npm
else
  echo "npm not found. Install Node.js with Homebrew or fix PATH for launchd." >&2
  exit 127
fi
exec "$NPM_BIN" run start -- -H "${LASTRO_HOST:-127.0.0.1}" -p "${LASTRO_PORT:-3030}"
