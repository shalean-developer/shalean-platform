#!/bin/bash
set -euo pipefail

# PLESK-AUTO-01: consume a guarded pricing-test pull bundle previously copied
# by Plesk Git deployment into the isolated deployment directory.
# No live Node activation/restart is performed.

ROOT="${HOME:?HOME is required}"
DEPLOY_DIR="${1:-$PWD}"
NODE_BIN="${NODE_BIN:-/opt/plesk/node/24/bin/node}"
fail(){ printf 'PLESK-AUTO-01 ERROR: %s\n' "$*" >&2; exit 1; }

URL_FILE="$DEPLOY_DIR/.plesk-pricing-test-pull/url.txt"
SUM_FILE="$DEPLOY_DIR/.plesk-pricing-test-pull/release.sha256"
META_FILE="$DEPLOY_DIR/.plesk-pricing-test-pull/build-meta.json"
[ -s "$URL_FILE" ] || fail "guarded signed URL missing"
[ -s "$SUM_FILE" ] || fail "guarded checksum missing"
[ -s "$META_FILE" ] || fail "guarded build metadata missing"
[ -x "$NODE_BIN" ] || fail "Node 24 binary missing"

SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["artifact_sha"])' "$META_FILE")"
case "$SHA" in *[!0-9a-f]*|'') fail "invalid artifact SHA" ;; esac
[ "${#SHA}" -eq 40 ] || fail "artifact SHA must be 40 characters"
SHORT="${SHA:0:8}"
URL="$(cat "$URL_FILE")"
EXPECTED="$(awk '{print $1}' "$SUM_FILE")"
[ "${#EXPECTED}" -eq 64 ] || fail "invalid checksum"

WORK="$ROOT/.pricing-test-release-staging/$SHA"
ARCHIVE="$WORK/release.tar.gz"
EXTRACT="$WORK/extracted"
RELEASE="$ROOT/plesk-pricing-test-$SHORT"
rm -rf "$WORK"; mkdir -p "$EXTRACT"
trap 'rm -rf "$WORK"' EXIT

if [ ! -e "$RELEASE" ]; then
  curl -fsSL --proto '=https' --tlsv1.2 "$URL" -o "$ARCHIVE"
  ACTUAL="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
  [ "$ACTUAL" = "$EXPECTED" ] || fail "artifact checksum mismatch"
  tar -tzf "$ARCHIVE" > "$WORK/contents"
  grep -Eq '^\./?build-meta\.json$' "$WORK/contents" || fail "build-meta missing"
  grep -Eq '^\./?runtime/apps/web/server\.js$' "$WORK/contents" || fail "server.js missing"
  tar -xzf "$ARCHIVE" -C "$EXTRACT"
  cmp -s "$META_FILE" "$EXTRACT/build-meta.json" || fail "bundle/artifact metadata mismatch"
  [ -d "$EXTRACT/runtime/apps/web/.next" ] || fail ".next missing"
  [ -d "$EXTRACT/runtime/apps/web/public" ] || fail "public missing"
  mv "$EXTRACT" "$RELEASE"
fi

APP="$RELEASE/runtime/apps/web"
PORT=3221
LOG="$WORK/probe.log"
(
  cd "$APP"
  HOSTNAME=127.0.0.1 PORT="$PORT" "$NODE_BIN" server.js
) >"$LOG" 2>&1 &
PID=$!
cleanup_pid(){ kill "$PID" >/dev/null 2>&1 || true; wait "$PID" >/dev/null 2>&1 || true; }
trap 'cleanup_pid; rm -rf "$WORK"' EXIT
ok=false
for _ in $(seq 1 15); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then ok=true; break; fi
  if ! kill -0 "$PID" >/dev/null 2>&1; then break; fi
  sleep 2
done
[ "$ok" = true ] || { tail -n 100 "$LOG" >&2 || true; fail "candidate health probe failed"; }
cleanup_pid
trap 'rm -rf "$WORK"' EXIT

STABLE="$ROOT/pricing-test-runtime"
mkdir -p "$STABLE"
CURRENT="$STABLE/current"
NEXT="$STABLE/.current.next"
PREVIOUS=""
if [ -L "$CURRENT" ]; then PREVIOUS="$(readlink -f "$CURRENT")"; elif [ -e "$CURRENT" ]; then fail "current is not symlink"; fi
printf '%s\n' "$PREVIOUS" > "$STABLE/rollback-target.txt"
cat > "$STABLE/server.js" <<'EOF'
'use strict';
const fs=require('fs'); const path=require('path');
const current=path.join(__dirname,'current');
const resolved=fs.realpathSync(current);
const server=path.join(resolved,'runtime','apps','web','server.js');
process.chdir(path.dirname(server)); require(server);
EOF
rm -f "$NEXT"; ln -s "$RELEASE" "$NEXT"; mv -Tf "$NEXT" "$CURRENT"
rm -f "$STABLE/public"; ln -s "current/runtime/apps/web/public" "$STABLE/public"

printf 'PLESK-AUTO-01 PREPARED\nrelease_sha=%s\nrelease=%s\ncurrent=%s\nlive_activation=NOT_PERFORMED\n' "$SHA" "$RELEASE" "$(readlink -f "$CURRENT")"
