#!/bin/bash
set -euo pipefail

ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="$DEPLOY_DIR/pricing-test-runtime.tar.gz"
LIVE="$ROOT/pricing-test-runtime"
BACKUPS="$ROOT/plesk-pricing-test-releases"
RESULT="$ROOT/plesk-pricing-test-preview-result.txt"
HEALTH_URL="https://pricing-test.shalean.co.za/api/health/environment"
EXPECTED_REF="uwvnmluiqbczeduzjgse"

fail(){
  printf 'PLESK_PR_PREVIEW_DEPLOY=ERROR\nREASON=%s\n' "$*" > "$RESULT"
  cat "$RESULT" >&2
  exit 1
}

[ -s "$BUNDLE" ] || fail "bundle missing"
mkdir -p "$BACKUPS"

META_SHA="$(tar -xOf "$BUNDLE" ./build-meta.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["artifact_sha"])')" || fail "could not read build metadata"
case "$META_SHA" in *[!0-9a-f]*|'') fail "invalid artifact sha" ;; esac
[ "${#META_SHA}" -eq 40 ] || fail "artifact sha must be 40 chars"
SHORT="${META_SHA:0:8}"
CANDIDATE="$ROOT/pricing-test-runtime.next-$SHORT"

[ ! -e "$CANDIDATE" ] || fail "candidate already exists; preserved"
[ ! -e "$ROOT/pricing-test-runtime.failed-$SHORT" ] || fail "failed release already exists; preserved"
mkdir -p "$CANDIDATE"
tar -xzf "$BUNDLE" -C "$CANDIDATE"

python3 - "$CANDIDATE/build-meta.json" "$META_SHA" "$EXPECTED_REF" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert d.get("artifact_sha")==sys.argv[2]
assert d.get("deployment_environment")=="staging"
assert d.get("target_host")=="pricing-test.shalean.co.za"
assert d.get("supabase_ref")==sys.argv[3]
assert d.get("server_secrets_baked_in") is False
PY

test -f "$CANDIDATE/server.js" || fail "server.js missing"
test -f "$CANDIDATE/server.next.js" || fail "server.next.js missing"
test -d "$CANDIDATE/.next" || fail ".next missing"
test -d "$CANDIDATE/public" || fail "public missing"

# Plesk keeps its generated write-only secret loader outside the Git artifact.
# Preserve it locally; never include runtime secrets in the deployment bundle.
if [ -e "$LIVE/.plesk-secrets.cjs" ] || [ -L "$LIVE/.plesk-secrets.cjs" ]; then
  [ -f "$LIVE/.plesk-secrets.cjs" ] && [ ! -L "$LIVE/.plesk-secrets.cjs" ] || fail "secret loader must be a regular private file"
  cp "$LIVE/.plesk-secrets.cjs" "$CANDIDATE/.plesk-secrets.cjs"
  chmod 600 "$CANDIDATE/.plesk-secrets.cjs"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK=""
if [ -d "$LIVE" ]; then
  ROLLBACK="$BACKUPS/rollback-$STAMP"
  [ ! -e "$ROLLBACK" ] || fail "rollback destination already exists; preserved"
  mv "$LIVE" "$ROLLBACK"
fi
mv "$CANDIDATE" "$LIVE"
mkdir -p "$LIVE/tmp"
touch "$LIVE/tmp/restart.txt"

ok=false
for _ in $(seq 1 40); do
  body="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
  if printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("status")=="ok" and d.get("deployment")=="staging" and d.get("releaseSha")==sys.argv[1] and (d.get("supabase") or {}).get("configuredRef")==sys.argv[2] and (d.get("paystack") or {}).get("secretMode")=="test" and (d.get("paystack") or {}).get("publicMode")=="test" and d.get("shaleanAppEnv")=="staging" and (d.get("zoho") or {}).get("writesBlocked") is True and (d.get("messaging") or {}).get("outboundDisabled") is True and not d.get("issues") else 1)' "$META_SHA" "$EXPECTED_REF"; then
    ok=true
    break
  fi
  sleep 3
done

if [ "$ok" != true ]; then
  FAILED="$ROOT/pricing-test-runtime.failed-$SHORT"
  mv "$LIVE" "$FAILED"
  if [ -n "$ROLLBACK" ] && [ -d "$ROLLBACK" ]; then
    mv "$ROLLBACK" "$LIVE"
    mkdir -p "$LIVE/tmp"
    touch "$LIVE/tmp/restart.txt"
  fi
  printf 'PLESK_PR_PREVIEW_DEPLOY=ROLLBACK\nFAILED_SHA=%s\n' "$META_SHA" > "$RESULT"
  cat "$RESULT" >&2
  exit 1
fi

# Rollbacks are retained. Any retention cleanup requires a separate explicit decision.

{
  echo "PLESK_PR_PREVIEW_DEPLOY=PASS"
  echo "RELEASE_SHA=$META_SHA"
  echo "ROLLBACK=$ROLLBACK"
  echo "HEALTH_URL=$HEALTH_URL"
} > "$RESULT"
cat "$RESULT"
