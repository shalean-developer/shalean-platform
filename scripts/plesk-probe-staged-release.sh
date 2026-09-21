#!/bin/bash
set -euo pipefail

# PLESK-PULL-03: verify and locally health-probe an immutable staged release.
# This script intentionally DOES NOT change Plesk application root, restart the
# live Node.js app, alter DNS/SSL, or delete any release.
#
# Usage:
#   bash scripts/plesk-probe-staged-release.sh <release_sha> [port]
#
# Required runtime environment is inherited from the caller. The candidate is
# bound to loopback only and is terminated after the probe.

RELEASE_SHA="${1:-}"
PORT="${2:-3217}"

fail() {
  printf 'PLESK-PULL-03 ERROR: %s\n' "$*" >&2
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

SHORT_SHA="${RELEASE_SHA:0:8}"
ROOT="${HOME:?HOME is required}"
RELEASE_DIR="$ROOT/plesk-prod-$SHORT_SHA"
APP_DIR="$RELEASE_DIR/runtime/apps/web"
META_FILE="$RELEASE_DIR/build-meta.json"
NODE_BIN="${NODE_BIN:-/opt/plesk/node/24/bin/node}"
LOG_DIR="$ROOT/.plesk-candidate-probe"
LOG_FILE="$LOG_DIR/$RELEASE_SHA.log"

[ -d "$RELEASE_DIR" ] || fail "staged release does not exist: $RELEASE_DIR"
[ -f "$META_FILE" ] || fail "build-meta.json missing"
[ -f "$APP_DIR/server.js" ] || fail "server.js missing"
[ -d "$APP_DIR/.next" ] || fail ".next missing"
[ -d "$APP_DIR/public" ] || fail "public missing"
[ -x "$NODE_BIN" ] || fail "Node binary is unavailable: $NODE_BIN"

grep -Fq "\"artifact_sha\": \"$RELEASE_SHA\"" "$META_FILE" ||   fail "build metadata does not match requested release SHA"

mkdir -p "$LOG_DIR"

# Refuse to collide with an existing listener if Plesk provides ss.
if command -v ss >/dev/null 2>&1; then
  if ss -ltn 2>/dev/null | grep -Eq "[:.]$PORT[[:space:]]"; then
    fail "candidate probe port $PORT is already in use"
  fi
fi

PID=""
cleanup() {
  if [ -n "$PID" ]; then
    kill "$PID" >/dev/null 2>&1 || true
    wait "$PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

printf 'PLESK-PULL-03: starting candidate %s on 127.0.0.1:%s\n' "$RELEASE_SHA" "$PORT"
(
  cd "$APP_DIR"
  HOSTNAME=127.0.0.1 PORT="$PORT" "$NODE_BIN" server.js
) >"$LOG_FILE" 2>&1 &
PID=$!

HEALTH_URL="http://127.0.0.1:$PORT/api/health"
BODY_FILE="$LOG_DIR/$RELEASE_SHA-health.json"

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
  printf 'Last health response:\n' >&2
  cat "$BODY_FILE" >&2 2>/dev/null || true
  printf '\nCandidate log:\n' >&2
  tail -n 80 "$LOG_FILE" >&2 || true
  fail "candidate failed local /api/health probe"
fi

printf 'PLESK-PULL-03 PASS\n'
printf 'release_sha=%s\n' "$RELEASE_SHA"
printf 'release_dir=%s\n' "$RELEASE_DIR"
printf 'health_url=%s\n' "$HEALTH_URL"
printf 'activation=NOT_PERFORMED\n'
