#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LABEL="net.lastro.server"
PLIST_SRC="$SCRIPT_DIR/LaunchAgents/net.lastro.server.local.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
cmd="${1:-status}"
case "$cmd" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents"
    sed "s#__LASTRO_DIR__#$SCRIPT_DIR#g" "$PLIST_SRC" > "$PLIST_DST"
    launchctl unload "$PLIST_DST" >/dev/null 2>&1 || true
    launchctl load "$PLIST_DST"
    ;;
  uninstall)
    launchctl unload "$PLIST_DST" >/dev/null 2>&1 || true
    rm -f "$PLIST_DST"
    ;;
  start) launchctl start "$LABEL" || true ;;
  stop) launchctl stop "$LABEL" || true ;;
  restart) "$0" stop; sleep 1; "$0" start ;;
  status) launchctl list | grep "$LABEL" || true ;;
  logs) tail -n 80 /tmp/lastro-server.out.log /tmp/lastro-server.err.log 2>/dev/null || true ;;
  ensure) "$0" install; "$0" start; "$0" status ;;
  *) echo "Usage: $0 {install|uninstall|start|stop|restart|status|logs|ensure}" >&2; exit 1 ;;
esac
