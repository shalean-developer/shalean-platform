#!/bin/bash
set -euo pipefail

# PLESK-PULL-05B: UAT the prepared stable application root without changing
# the live Plesk Node.js Application Root.
#
# Usage:
#   bash scripts/plesk-probe-stable-runtime.sh <release_sha> [port]
#
# The stable wrapper ($HOME/plesk-runtime/server.js) is started on loopback
# only, /api/health is verified, and the process is always terminated.

RELEASE_SHA="${1:-}"
PORT="${2:-3219}"

fail() {
  printf 'PLESK-PULL-05B ERROR: %s\n' "$*" >&2
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
EXPECTED_RELEASE="$ROOT/plesk-prod-$SHORT_SHA"
STABLE_ROOT="$ROOT/plesk-runtime"
CURRENT="$STABLE_ROOT/current"
WRAPPER="$STABLE_ROOT/server.js"
PUBLIC="$STABLE_ROOT/public"
NODE_BIN="${NODE_BIN:-/opt/plesk/node/24/bin/node}"
PROBE_DIR="$ROOT/.plesk-stable-root-probe"
LOG_FILE="$PROBE_DIR/$RELEASE_SHA.log"
BODY_FILE="$PROBE_DIR/$RELEASE_SHA-health.json"

[ -L "$CURRENT" ] || fail "stable current pointer is missing"
RESOLVED="$(readlink -f "$CURRENT")"
[ "$RESOLVED" = "$EXPECTED_RELEASE" ] ||   fail "stable current pointer does not target requested release"

[ -f "$EXPECTED_RELEASE/build-meta.json" ] || fail "build-meta.json missing"
grep -Fq "\"artifact_sha\": \"$RELEASE_SHA\"" "$EXPECTED_RELEASE/build-meta.json" ||   fail "build metadata does not match requested release SHA"
[ -f "$WRAPPER" ] || fail "stable server.js wrapper missing"
[ -L "$PUBLIC" ] || fail "stable public path is not a symbolic link"
[ -d "$PUBLIC" ] || fail "stable public path does not resolve"
[ -f "$CURRENT/runtime/apps/web/server.js" ] || fail "candidate server.js missing"
[ -d "$CURRENT/runtime/apps/web/.next" ] || fail "candidate .next missing"
[ -d "$CURRENT/runtime/apps/web/public" ] || fail "candidate public missing"
[ -x "$NODE_BIN" ] || fail "Node binary unavailable: $NODE_BIN"

mkdir -p "$PROBE_DIR"

PID=""
cleanup() {
  if [ -n "$PID" ]; then
    kill "$PID" >/dev/null 2>&1 || true
    wait "$PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

printf 'PLESK-PULL-05B: starting stable wrapper on 127.0.0.1:%s\n' "$PORT"
(
  cd "$STABLE_ROOT"
  HOSTNAME=127.0.0.1 PORT="$PORT" "$NODE_BIN" server.js
) >"$LOG_FILE" 2>&1 &
PID=$!

HEALTH_URL="http://127.0.0.1:$PORT/api/health"
ok=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "$PID" >/dev/null 2>&1; then
    tail -n 80 "$LOG_FILE" >&2 || true
    fail "stable wrapper exited before becoming healthy"
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
  printf '\nStable wrapper log:\n' >&2
  tail -n 80 "$LOG_FILE" >&2 || true
  fail "stable root failed local /api/health UAT"
fi

printf 'PLESK-PULL-05B PASS\n'
printf 'release_sha=%s\n' "$RELEASE_SHA"
printf 'stable_root=%s\n' "$STABLE_ROOT"
printf 'current_target=%s\n' "$RESOLVED"
printf 'health_url=%s\n' "$HEALTH_URL"
printf 'production_activation=NOT_PERFORMED\n'
