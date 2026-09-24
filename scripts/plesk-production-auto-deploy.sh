#!/bin/bash
set -euo pipefail

# PLESK-PROD-AUTO-01 — guarded production activation.
# Intended only for shalean.co.za Plesk "Additional deployment actions".
# It never touches pricing-test-runtime or runs the staging deploy scripts.
#
# Production contract:
# - exact current production SHA only
# - exact successful "Plesk production standalone artifact" for that SHA
# - production metadata only (target host, environment, production Supabase ref)
# - immutable release directory
# - candidate loopback health before activation
# - /plesk-runtime is preserved as rollback until public exact-SHA health passes

ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
HEADER="$ROOT/.plesk-secrets/github-actions-auth-header"
REPO="shalean-developer/shalean-platform"
API="https://api.github.com/repos/$REPO"
NODE_BIN="${NODE_BIN:-/opt/plesk/node/24/bin/node}"
LIVE="$ROOT/plesk-runtime"
BACKUPS="$ROOT/plesk-production-releases"
WORK="$ROOT/.plesk-production-auto"
LOCK="$ROOT/.plesk-production-auto.lock"
OUT="$ROOT/plesk-production-auto-result.txt"
HEALTH_URL="${PLESK_PROD_HEALTH_URL:-https://shalean.co.za/api/health/environment}"
EXPECTED_REF="${PLESK_PROD_EXPECTED_SUPABASE_REF:-paqjwfulwywtsyyvdxrq}"
WAIT_SECONDS="${PLESK_PROD_AUTO_WAIT_SECONDS:-1200}"
POLL_SECONDS="${PLESK_PROD_AUTO_POLL_SECONDS:-15}"

fail(){ printf 'PLESK-PROD-AUTO-01 ERROR: %s\n' "$*" | tee "$OUT" >&2; exit 1; }
[ -r "$HEADER" ] || fail "GitHub auth header unreadable"
[ -x "$NODE_BIN" ] || fail "Node 24 binary missing"
for x in /usr/bin/curl /usr/bin/python3 /usr/bin/unzip /usr/bin/tar /usr/bin/sha256sum /usr/bin/flock /usr/bin/touch; do
  [ -x "$x" ] || fail "required tool missing: $x"
done

exec 9>"$LOCK"
/usr/bin/flock -w 1500 9 || fail "timed out waiting for production deployment lock"
rm -rf "$WORK"; mkdir -p "$WORK" "$BACKUPS"
trap 'rm -rf "$WORK"' EXIT

ghget(){ /usr/bin/curl -fsSL --connect-timeout 10 --max-time 30 -H "@$HEADER" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "$@"; }
ghdownload(){
  # Artifact downloads are ~50 MB and GitHub redirects to blob storage. Give the
  # transfer enough time for shared-host bandwidth and retry transient stalls.
  /usr/bin/curl -fL --connect-timeout 15 --max-time 600 --retry 4 --retry-delay 3 --retry-all-errors \
    -H "@$HEADER" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "$@"
}
branch_sha(){
  ghget "$API/branches/production" > "$WORK/branch.json"
  /usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"]["sha"])' "$WORK/branch.json"
}

TARGET_SHA="$(branch_sha)" || fail "could not resolve integration release head"
case "$TARGET_SHA" in *[!0-9a-f]*|'') fail "invalid release SHA" ;; esac
[ "${#TARGET_SHA}" -eq 40 ] || fail "release SHA must be 40 chars"
SHORT="${TARGET_SHA:0:8}"
printf 'PLESK-PROD-AUTO-01 target=%s\n' "$TARGET_SHA"

# Wait for the exact production artifact. Never fall back to an older artifact.
ELAPSED=0; RUN_ID=""; ART_ID=""
while [ "$ELAPSED" -le "$WAIT_SECONDS" ]; do
  ghget "$API/actions/runs?branch=production&per_page=50" > "$WORK/runs.json" || true
  /usr/bin/python3 - "$WORK/runs.json" "$TARGET_SHA" > "$WORK/run.txt" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception: d={}
target=sys.argv[2]
xs=[r for r in d.get("workflow_runs",[]) if r.get("name")=="Plesk production standalone artifact" and r.get("head_sha")==target]
if not xs: print("missing|||")
else:
 r=xs[0]; print("found|{}|{}|{}".format(r.get("id",""),r.get("status",""),r.get("conclusion") or ""))
PY
  IFS='|' read -r FOUND RUN_ID STATUS CONCLUSION < "$WORK/run.txt"
  if [ "$FOUND" = found ] && [ "$STATUS" = completed ]; then
    [ "$CONCLUSION" = success ] || fail "exact production artifact workflow completed with $CONCLUSION"
    break
  fi
  [ "$ELAPSED" -lt "$WAIT_SECONDS" ] || fail "timed out waiting for exact production artifact"
  sleep "$POLL_SECONDS"; ELAPSED=$((ELAPSED + POLL_SECONDS))
done

ghget "$API/actions/runs/$RUN_ID/artifacts?per_page=100" > "$WORK/artifacts.json"
/usr/bin/python3 - "$WORK/artifacts.json" "$TARGET_SHA" > "$WORK/artifact-id.txt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); sha=sys.argv[2]; name="plesk-prod-"+sha
xs=[a for a in d.get("artifacts",[]) if a.get("name")==name and not a.get("expired")]
if len(xs)!=1: raise SystemExit("expected exactly one exact-SHA production artifact")
print(xs[0]["id"])
PY
ART_ID="$(cat "$WORK/artifact-id.txt")"
ghdownload "$API/actions/artifacts/$ART_ID/zip" > "$WORK/artifact.zip"
/usr/bin/unzip -q "$WORK/artifact.zip" -d "$WORK/downloaded"
TAR="$WORK/downloaded/plesk-prod-$TARGET_SHA.tar.gz"
[ -s "$TAR" ] || fail "production tarball missing"
mkdir "$WORK/extracted"
/usr/bin/tar -xzf "$TAR" -C "$WORK/extracted"
META="$WORK/extracted/build-meta.json"
APP="$WORK/extracted/runtime/apps/web"
[ -f "$META" ] || fail "build-meta.json missing"
[ -f "$APP/server.js" ] || fail "server.js missing"
[ -d "$APP/public" ] || fail "public missing"
[ -d "$APP/.next" ] || fail ".next missing"

/usr/bin/python3 - "$META" "$TARGET_SHA" "$EXPECTED_REF" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); sha=sys.argv[2]; ref=sys.argv[3]
assert d.get("artifact_sha")==sha, "artifact SHA mismatch"
assert d.get("deployment_environment")=="production", "not a production artifact"
assert d.get("target_host")=="shalean.co.za", "target host mismatch"
assert d.get("supabase_ref")==ref, "production Supabase ref mismatch"
assert d.get("server_secrets_baked_in") is False, "artifact unexpectedly contains server secrets"
PY

# Re-check branch immediately before candidate probe/activation.
[ "$(branch_sha)" = "$TARGET_SHA" ] || fail "release branch moved; refusing stale production activation"

# Probe candidate locally with the existing production process environment.
PORT=3231; LOG="$WORK/probe.log"
( cd "$APP"; SHALEAN_RELEASE_SHA="$TARGET_SHA" HOSTNAME=127.0.0.1 PORT="$PORT" "$NODE_BIN" server.js ) >"$LOG" 2>&1 &
PID=$!
probe_cleanup(){ kill "$PID" >/dev/null 2>&1 || true; wait "$PID" >/dev/null 2>&1 || true; }
trap 'probe_cleanup; rm -rf "$WORK"' EXIT
OK=false
for _ in $(seq 1 30); do
  if /usr/bin/curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then OK=true; break; fi
  kill -0 "$PID" >/dev/null 2>&1 || break
  sleep 2
done
[ "$OK" = true ] || { tail -n 80 "$LOG" >&2 || true; fail "candidate loopback health failed"; }
probe_cleanup
trap 'rm -rf "$WORK"' EXIT

# Materialize immutable candidate first.
RELEASE="$BACKUPS/plesk-prod-$SHORT"
if [ ! -e "$RELEASE" ]; then mv "$WORK/extracted" "$RELEASE"; fi
[ -f "$RELEASE/runtime/apps/web/server.js" ] || fail "immutable release invalid"

# Keep a byte-for-byte rollback of the current live runtime before replacement.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK="$BACKUPS/rollback-$STAMP"
[ -f "$LIVE/server.js" ] || fail "current /plesk-runtime server.js missing"
mv "$LIVE" "$ROLLBACK"
mkdir "$LIVE"
cp -a "$RELEASE/runtime/apps/web/." "$LIVE/"
cp -a "$RELEASE/build-meta.json" "$LIVE/build-meta.json"
cat > "$LIVE/server.js.tmp" <<'EOF'
'use strict';
process.env.SHALEAN_RELEASE_SHA=process.env.SHALEAN_RELEASE_SHA || require('./build-meta.json').artifact_sha;
require('./server.next.js');
EOF
mv "$LIVE/server.js" "$LIVE/server.next.js"
mv "$LIVE/server.js.tmp" "$LIVE/server.js"

restart(){ mkdir -p "$LIVE/tmp"; /usr/bin/touch "$LIVE/tmp/restart.txt"; }
restore(){
  rm -rf "$LIVE.failed" 2>/dev/null || true
  mv "$LIVE" "$LIVE.failed"
  mv "$ROLLBACK" "$LIVE"
  mkdir -p "$LIVE/tmp"; /usr/bin/touch "$LIVE/tmp/restart.txt"
}
restart

health_exact(){
  local body="$WORK/health.json" http
  for _ in $(seq 1 40); do
    http="$(/usr/bin/curl -sS -o "$body" -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true)"
    if [ "$http" = 200 ] && /usr/bin/python3 - "$body" "$TARGET_SHA" "$EXPECTED_REF" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); sha=sys.argv[2]; ref=sys.argv[3]
ok=(d.get("status")=="ok" and d.get("deployment")=="production" and d.get("releaseSha")==sha and (d.get("supabase") or {}).get("configuredRef")==ref and (d.get("paystack") or {}).get("secretMode")=="live" and (d.get("paystack") or {}).get("publicMode")=="live" and not d.get("issues"))
raise SystemExit(0 if ok else 1)
PY
    then return 0; fi
    sleep 3
  done
  return 1
}

if health_exact; then
  {
    echo "PLESK_PROD_AUTO_01=PASS"
    echo "RELEASE_SHA=$TARGET_SHA"
    echo "RELEASE=$RELEASE"
    echo "ROLLBACK=$ROLLBACK"
    echo "HEALTH_URL=$HEALTH_URL"
  } > "$OUT"
  cat "$OUT"
  exit 0
fi

restore
fail "candidate production health failed; previous /plesk-runtime restored"
