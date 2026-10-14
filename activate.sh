#!/bin/bash
set -euo pipefail

ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="$DEPLOY_DIR/production-runtime.tar.gz"
LIVE="$ROOT/plesk-runtime"
BACKUPS="$ROOT/plesk-production-releases"
RESULT="$ROOT/plesk-prebuilt-deploy-result.txt"
HEALTH_URL="https://shalean.co.za/api/health/environment"
EXPECTED_REF="paqjwfulwywtsyyvdxrq"

fail(){
  printf 'PLESK_PREBUILT_DEPLOY=ERROR\nREASON=%s\n' "$*" > "$RESULT"
  cat "$RESULT" >&2
  exit 1
}

[ -s "$BUNDLE" ] || fail "bundle missing"
mkdir -p "$BACKUPS"

META_SHA="$(tar -xOf "$BUNDLE" ./build-meta.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["artifact_sha"])')" || fail "could not read build metadata"
case "$META_SHA" in *[!0-9a-f]*|'') fail "invalid artifact sha" ;; esac
[ "${#META_SHA}" -eq 40 ] || fail "artifact sha must be 40 chars"
SHORT="${META_SHA:0:8}"
CANDIDATE="$ROOT/plesk-runtime.next-$SHORT"

rm -rf "$CANDIDATE"
mkdir -p "$CANDIDATE"
tar -xzf "$BUNDLE" -C "$CANDIDATE"

python3 - "$CANDIDATE/build-meta.json" "$META_SHA" "$EXPECTED_REF" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert d.get("artifact_sha")==sys.argv[2]
assert d.get("deployment_environment")=="production"
assert d.get("target_host")=="shalean.co.za"
assert d.get("supabase_ref")==sys.argv[3]
assert d.get("server_secrets_baked_in") is False
PY

test -f "$CANDIDATE/server.js" || fail "server.js missing"
test -f "$CANDIDATE/server.next.js" || fail "server.next.js missing"
test -d "$CANDIDATE/.next" || fail ".next missing"
test -d "$CANDIDATE/public" || fail "public missing"
test -f "$LIVE/server.js" || fail "live runtime missing"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK="$BACKUPS/rollback-$STAMP"

mv "$LIVE" "$ROLLBACK"
mv "$CANDIDATE" "$LIVE"
mkdir -p "$LIVE/tmp"
touch "$LIVE/tmp/restart.txt"

ok=false
for _ in $(seq 1 40); do
  body="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
  if printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("status")=="ok" and d.get("deployment")=="production" and d.get("releaseSha")==sys.argv[1] and (d.get("supabase") or {}).get("configuredRef")==sys.argv[2] and (d.get("paystack") or {}).get("secretMode")=="live" and (d.get("paystack") or {}).get("publicMode")=="live" and not d.get("issues") else 1)' "$META_SHA" "$EXPECTED_REF"; then
    ok=true
    break
  fi
  sleep 3
done

if [ "$ok" != true ]; then
  FAILED="$ROOT/plesk-runtime.failed-$SHORT"
  rm -rf "$FAILED"
  mv "$LIVE" "$FAILED"
  mv "$ROLLBACK" "$LIVE"
  mkdir -p "$LIVE/tmp"
  touch "$LIVE/tmp/restart.txt"
  printf 'PLESK_PREBUILT_DEPLOY=ROLLBACK\nFAILED_SHA=%s\n' "$META_SHA" > "$RESULT"
  cat "$RESULT" >&2
  exit 1
fi

python3 - "$BACKUPS" "$ROLLBACK" <<'PY'
import os,shutil,sys
root,current=sys.argv[1:3]
items=[]
for name in os.listdir(root):
    path=os.path.join(root,name)
    if name.startswith("rollback-") and os.path.isdir(path):
        items.append((os.path.getmtime(path),path))
items.sort(reverse=True)
keep={current}
for _,path in items[:1]:
    keep.add(path)
for _,path in items:
    if path not in keep:
        shutil.rmtree(path)
PY

{
  echo "PLESK_PREBUILT_DEPLOY=PASS"
  echo "RELEASE_SHA=$META_SHA"
  echo "ROLLBACK=$ROLLBACK"
  echo "HEALTH_URL=$HEALTH_URL"
} > "$RESULT"
cat "$RESULT"
