#!/bin/bash
set -euo pipefail

# PLESK-AUTO-01: activate an already staged pricing-test release through a
# stable runtime pointer, verify public environment health, and roll back the
# pointer automatically if activation health fails.
#
# This script does not modify DNS, SSL, databases, Paystack configuration, or
# Plesk environment variables. Plesk must already be configured with:
#   Application Root:  <subscription>/pricing-test-runtime
#   Document Root:     <subscription>/pricing-test-runtime/public
#   Startup File:      server.js
#
# Restart command is injected by the caller because Plesk installations differ:
#   PLESK_RESTART_CMD='...' bash scripts/plesk-pricing-test-activate.sh <sha>

RELEASE_SHA="${1:-}"
RESTART_CMD="${PLESK_RESTART_CMD:-}"
HEALTH_URL="${PLESK_TEST_HEALTH_URL:-https://pricing-test.shalean.co.za/api/health/environment}"
ROOT="${HOME:?HOME is required}"
STABLE="${PLESK_TEST_STABLE_ROOT:-$ROOT/pricing-test-runtime}"

fail() { printf 'PLESK-AUTO-01 ERROR: %s\n' "$*" >&2; exit 1; }

case "$RELEASE_SHA" in *[!0-9a-f]*|'') fail "release SHA must be lowercase hexadecimal" ;; esac
[ "${#RELEASE_SHA}" -eq 40 ] || fail "release SHA must contain exactly 40 characters"
[ -n "$RESTART_CMD" ] || fail "PLESK_RESTART_CMD is required"

SHORT="${RELEASE_SHA:0:8}"
CANDIDATE="$ROOT/plesk-pricing-test-$SHORT"
[ -f "$CANDIDATE/build-meta.json" ] || fail "candidate build-meta.json missing"
[ -f "$CANDIDATE/runtime/apps/web/server.js" ] || fail "candidate server.js missing"
[ -d "$CANDIDATE/runtime/apps/web/.next" ] || fail "candidate .next missing"
[ -d "$CANDIDATE/runtime/apps/web/public" ] || fail "candidate public missing"
grep -Fq "\"artifact_sha\":\"$RELEASE_SHA\"" "$CANDIDATE/build-meta.json" || \
grep -Fq "\"artifact_sha\": \"$RELEASE_SHA\"" "$CANDIDATE/build-meta.json" || fail "candidate metadata SHA mismatch"

mkdir -p "$STABLE"
CURRENT="$STABLE/current"
NEXT="$STABLE/.current.next"
PUBLIC="$STABLE/public"
WRAPPER="$STABLE/server.js"
ROLLBACK="$STABLE/rollback-target.txt"
PREVIOUS=""
if [ -L "$CURRENT" ]; then PREVIOUS="$(readlink -f "$CURRENT")"; elif [ -e "$CURRENT" ]; then fail "current exists but is not symlink"; fi
printf '%s\n' "$PREVIOUS" > "$ROLLBACK"

cat > "$WRAPPER" <<'EOF'
'use strict';
const fs=require('fs'); const path=require('path');
const current=path.join(__dirname,'current');
let resolved; try { resolved=fs.realpathSync(current); } catch(e) { console.error(e.message); process.exit(1); }
const metaPath=path.join(resolved,'build-meta.json');
const server=path.join(resolved,'runtime','apps','web','server.js');
if(!fs.existsSync(metaPath)){ console.error('Missing candidate build-meta.json'); process.exit(1); }
if(!fs.existsSync(server)){ console.error('Missing candidate server.js'); process.exit(1); }
let meta; try { meta=JSON.parse(fs.readFileSync(metaPath,'utf8')); } catch(e) { console.error('Invalid candidate build-meta.json'); process.exit(1); }
if(!meta.artifact_sha){ console.error('Missing candidate artifact SHA'); process.exit(1); }
process.env.SHALEAN_RELEASE_SHA=String(meta.artifact_sha);
process.chdir(path.dirname(server)); require(server);
EOF

rm -f "$NEXT"
ln -s "$CANDIDATE" "$NEXT"
mv -Tf "$NEXT" "$CURRENT"
rm -f "$PUBLIC"
ln -s "current/runtime/apps/web/public" "$PUBLIC"

restart() { bash -lc "$RESTART_CMD"; }
health() {
  local body http
  body="$(mktemp)"
  for _ in $(seq 1 20); do
    http="$(curl -sS -o "$body" -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true)"
    if [ "$http" = 200 ] &&
       grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$body" &&
       grep -Eq '"deployment"[[:space:]]*:[[:space:]]*"staging"' "$body" &&
       grep -Eq '"configuredRef"[[:space:]]*:[[:space:]]*"jhubpsbwmjgydkzztxeu"' "$body"; then
      rm -f "$body"; return 0
    fi
    sleep 3
  done
  cat "$body" >&2 2>/dev/null || true; rm -f "$body"; return 1
}

restart
if health; then
  printf 'PLESK-AUTO-01 PASS\nrelease_sha=%s\ncurrent=%s\n' "$RELEASE_SHA" "$(readlink -f "$CURRENT")"
  exit 0
fi

printf 'PLESK-AUTO-01: candidate unhealthy; rolling back\n' >&2
[ -n "$PREVIOUS" ] || fail "candidate unhealthy and no rollback target exists"
[ -f "$PREVIOUS/runtime/apps/web/server.js" ] || fail "rollback target invalid"
rm -f "$NEXT"
ln -s "$PREVIOUS" "$NEXT"
mv -Tf "$NEXT" "$CURRENT"
restart
health || fail "rollback runtime also failed public health verification"
fail "candidate activation failed; previous release restored"
