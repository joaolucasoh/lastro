#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$SCRIPT_DIR/lastroctl.sh" uninstall || true
if [ "${LASTRO_REMOVE_INSTALL:-0}" = "1" ]; then
  rm -rf "$SCRIPT_DIR"
fi
if [ "${LASTRO_REMOVE_DATA:-0}" = "1" ]; then
  rm -rf "${LASTRO_DATA_DIR:-$HOME/LastroData}"
fi
