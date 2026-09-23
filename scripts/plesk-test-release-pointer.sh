#!/bin/bash
set -euo pipefail

# PLESK-PULL-04: prove an atomic, rollback-capable release pointer without
# changing the live Plesk Node.js application root.
#
# Usage:
#   bash scripts/plesk-test-release-pointer.sh <release_sha> [port]
#
# This creates/updates only $HOME/.plesk-release-control/candidate-current,
# starts the candidate through that pointer on loopback, health-checks it, and
# restores the previous pointer automatically on failure. It DOES NOT touch
# the production Plesk application configuration or restart the live app.

RELEASE_SHA="${1:-}"
PORT="${2:-3218}"

fail() {
  printf 'PLESK-PULL-04 ERROR: %s\n' "$*" >&2
  exit 1
}

case "$RELEASE_SHA" in
  *[!0-9a-f]*|'') fail "release SHA must be lowercase hexadecimal" ;;
esac
[ "${#RELEASE_SHA}" -eq 40 ] || fail "release SHA must contain exactly 40 characters"

case "$PORT" in
  *[!0-9]*|'') fail "port must be numeric" ;;
esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "port must be between 1024 and 65535"

ROOT="${HOME:?HOME is required}"
SHORT_SHA="${RELEASE_SHA:0:8}"
RELEASE_DIR="$ROOT/plesk-prod-$SHORT_SHA"
APP_DIR="$RELEASE_DIR/runtime/apps/web"
META_FILE="$RELEASE_DIR/build-meta.json"
CONTROL_DIR="$ROOT/.plesk-release-control"
POINTER="$CONTROL_DIR/candidate-current"
NEXT_POINTER="$CONTROL_DIR/.candidate-current.next"
PREVIOUS_FILE="$CONTROL_DIR/previous-target.txt"
NODE_BIN="${NODE_BIN:-/opt/plesk/node/24/bin/node}"
LOG_FILE="$CONTROL_DIR/$RELEASE_SHA-pointer-probe.log"
BODY_FILE="$CONTROL_DIR/$RELEASE_SHA-pointer-health.json"

[ -d "$RELEASE_DIR" ] || fail "staged release does not exist: $RELEASE_DIR"
[ -f "$META_FILE" ] || fail "build-meta.json missing"
[ -f "$APP_DIR/server.js" ] || fail "server.js missing"
[ -d "$APP_DIR/.next" ] || fail ".next missing"
[ -d "$APP_DIR/public" ] || fail "public missing"
[ -x "$NODE_BIN" ] || fail "Node binary unavailable: $NODE_BIN"
grep -Fq "\"artifact_sha\": \"$RELEASE_SHA\"" "$META_FILE" ||   fail "build metadata does not match requested release SHA"

mkdir -p "$CONTROL_DIR"

PREVIOUS_TARGET=""
if [ -L "$POINTER" ]; then
  PREVIOUS_TARGET="$(readlink "$POINTER")"
elif [ -e "$POINTER" ]; then
  fail "candidate pointer exists but is not a symbolic link"
fi
printf '%s\n' "$PREVIOUS_TARGET" > "$PREVIOUS_FILE"

rm -f "$NEXT_POINTER"
ln -s "$RELEASE_DIR" "$NEXT_POINTER"
mv -Tf "$NEXT_POINTER" "$POINTER"

restore_pointer() {
  rm -f "$NEXT_POINTER"
  if [ -n "$PREVIOUS_TARGET" ]; then
    ln -s "$PREVIOUS_TARGET" "$NEXT_POINTER"
    mv -Tf "$NEXT_POINTER" "$POINTER"
  else
    rm -f "$POINTER"
  fi
}

PID=""
passed=false
cleanup() {
  if [ -n "$PID" ]; then
    kill "$PID" >/dev/null 2>&1 || true
    wait "$PID" >/dev/null 2>&1 || true
  fi
  if [ "$passed" != "true" ]; then
    restore_pointer
  fi
}
trap cleanup EXIT INT TERM

RESOLVED="$(readlink -f "$POINTER")"
[ "$RESOLVED" = "$RELEASE_DIR" ] || fail "atomic pointer does not resolve to requested release"

printf 'PLESK-PULL-04: candidate pointer -> %s\n' "$RESOLVED"
(
  cd "$POINTER/runtime/apps/web"
  HOSTNAME=127.0.0.1 PORT="$PORT" "$NODE_BIN" server.js
) >"$LOG_FILE" 2>&1 &
PID=$!

HEALTH_URL="http://127.0.0.1:$PORT/api/health"
ok=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "$PID" >/dev/null 2>&1; then
    tail -n 80 "$LOG_FILE" >&2 || true
    fail "candidate process exited before becoming healthy"
  fi
  HTTP="$(curl --silent --show-error --output "$BODY_FILE" --write-out '%{http_code}'     --max-time 5 "$HEALTH_URL" || true)"
  if [ "$HTTP" = "200" ] && grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$BODY_FILE"; then
    ok=true
    break
  fi
  sleep 2
done

if [ "$ok" != "true" ]; then
  cat "$BODY_FILE" >&2 2>/dev/null || true
  tail -n 80 "$LOG_FILE" >&2 || true
  fail "candidate failed health probe through atomic pointer"
fi

passed=true
printf 'PLESK-PULL-04 POINTER TEST PASS\n'
printf 'release_sha=%s\n' "$RELEASE_SHA"
printf 'pointer=%s\n' "$POINTER"
printf 'target=%s\n' "$RESOLVED"
printf 'production_activation=NOT_PERFORMED\n'
