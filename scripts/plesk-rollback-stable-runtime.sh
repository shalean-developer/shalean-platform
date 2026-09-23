#!/bin/bash
set -euo pipefail

# PLESK-PULL-05 rollback control for the stable runtime pointer.
# This changes ONLY $HOME/plesk-runtime/current. It does not change Plesk
# configuration or restart the live application.
#
# Usage:
#   bash scripts/plesk-rollback-stable-runtime.sh [target_release_dir]
#
# Without an explicit target, rollback-target.txt from preparation is used.

ROOT="${HOME:?HOME is required}"
STABLE_DIR="$ROOT/plesk-runtime"
CURRENT="$STABLE_DIR/current"
NEXT="$STABLE_DIR/.current.rollback"
ROLLBACK_FILE="$STABLE_DIR/rollback-target.txt"
TARGET="${1:-}"

fail() {
  printf 'PLESK-PULL-05 ROLLBACK ERROR: %s\n' "$*" >&2
  exit 1
}

if [ -z "$TARGET" ]; then
  [ -f "$ROLLBACK_FILE" ] || fail "rollback target record missing"
  TARGET="$(cat "$ROLLBACK_FILE")"
fi

[ -n "$TARGET" ] || fail "no previous rollback target was recorded"

case "$TARGET" in
  /*) ;;
  *) TARGET="$STABLE_DIR/$TARGET" ;;
esac

TARGET="$(readlink -f "$TARGET" 2>/dev/null || true)"
[ -n "$TARGET" ] || fail "rollback target cannot be resolved"

case "$TARGET" in
  "$ROOT"/plesk-prod-*) ;;
  *) fail "rollback target is outside immutable Plesk releases" ;;
esac

[ -f "$TARGET/build-meta.json" ] || fail "rollback build-meta.json missing"
[ -f "$TARGET/runtime/apps/web/server.js" ] || fail "rollback server.js missing"
[ -d "$TARGET/runtime/apps/web/.next" ] || fail "rollback .next missing"
[ -d "$TARGET/runtime/apps/web/public" ] || fail "rollback public missing"

rm -f "$NEXT"
ln -s "$TARGET" "$NEXT"
mv -Tf "$NEXT" "$CURRENT"

RESOLVED="$(readlink -f "$CURRENT")"
[ "$RESOLVED" = "$TARGET" ] || fail "rollback pointer verification failed"

printf 'PLESK-PULL-05 ROLLBACK POINTER READY\n'
printf 'current_target=%s\n' "$RESOLVED"
printf 'production_restart=NOT_PERFORMED\n'
