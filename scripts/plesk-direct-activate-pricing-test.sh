#!/bin/bash
set -euo pipefail

# Direct GitHub -> Plesk activation for pricing-test.
# Usage: plesk-direct-activate.sh <sha> <tarball>
SHA="${1:?sha required}"
TARBALL="${2:?tarball required}"
ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
SHORT="${SHA:0:8}"
RELEASE="$ROOT/plesk-pricing-test-$SHORT"
STABLE="$ROOT/pricing-test-runtime"
CURRENT="$STABLE/current"
NEXT="$STABLE/.current.next"
ROLLBACK="$STABLE/rollback-target.txt"
HEALTH_URL="https://pricing-test.shalean.co.za/api/health/environment"
EXPECTED_REF="jhubpsbwmjgydkzztxeu"

case "$SHA" in *[!0-9a-f]*|'') echo "invalid sha" >&2; exit 1;; esac
[ "${#SHA}" -eq 40 ] || { echo "sha must be 40 chars" >&2; exit 1; }
[ -s "$TARBALL" ] || { echo "tarball missing" >&2; exit 1; }

mkdir -p "$STABLE"
PREVIOUS="$(readlink -f "$CURRENT" 2>/dev/null || true)"

if [ ! -d "$RELEASE" ]; then
  TMP="$ROOT/.direct-pricing-test-$SHORT"
  rm -rf "$TMP"
  mkdir -p "$TMP"
  tar -xzf "$TARBALL" -C "$TMP"
  test -f "$TMP/build-meta.json"
  test -f "$TMP/runtime/apps/web/server.js"
  python3 - "$TMP/build-meta.json" "$SHA" "$EXPECTED_REF" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert d.get("artifact_sha")==sys.argv[2]
assert d.get("deployment_environment") in ("test","staging")
assert d.get("supabase_ref")==sys.argv[3]
PY
  mv "$TMP" "$RELEASE"
fi

printf '%s' "$PREVIOUS" > "$ROLLBACK"
rm -f "$NEXT"
ln -s "$RELEASE" "$NEXT"
mv -Tf "$NEXT" "$CURRENT"
mkdir -p "$STABLE/tmp"
touch "$STABLE/tmp/restart.txt"

ok=false
for _ in $(seq 1 40); do
  body="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
  if printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("status")=="ok" and d.get("deployment")=="staging" and d.get("releaseSha")==sys.argv[1] and (d.get("supabase") or {}).get("configuredRef")==sys.argv[2] else 1)' "$SHA" "$EXPECTED_REF"; then
    ok=true
    break
  fi
  sleep 3
done

if [ "$ok" != true ]; then
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    rm -f "$NEXT"
    ln -s "$PREVIOUS" "$NEXT"
    mv -Tf "$NEXT" "$CURRENT"
    touch "$STABLE/tmp/restart.txt"
  fi
  echo "DIRECT_DEPLOY=ROLLBACK" >&2
  exit 1
fi

rm -f "$TARBALL"
echo "DIRECT_DEPLOY=PASS"
echo "RELEASE_SHA=$SHA"
echo "RELEASE=$RELEASE"
