#!/bin/bash
set -euo pipefail

# PLESK-AUTO-03 — guarded automatic pricing-test deployment.
#
# Intended Plesk "Additional deployment actions":
#   /bin/bash ./scripts/plesk-pricing-test-auto-deploy.sh
#
# Plesk may start this action immediately after a branch push, before GitHub has
# finished building the immutable runtime. This script therefore:
#   1. captures the current integration release SHA,
#   2. waits a bounded period for the exact-SHA pricing-test workflow,
#   3. prepares and probes that exact immutable artifact,
#   4. restarts Passenger using Plesk's supported tmp/restart.txt mechanism,
#   5. verifies the public environment reports the exact release SHA,
#   6. automatically restores the previous stable pointer if activation fails.
#
# It does not modify DNS, SSL, databases, Plesk Node configuration, Paystack
# configuration, or outbound messaging policy.

ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
HEADER="$ROOT/.plesk-secrets/github-actions-auth-header"
REPO="shalean-developer/shalean-platform"
API="https://api.github.com/repos/$REPO"
STABLE="$ROOT/pricing-test-runtime"
CURRENT="$STABLE/current"
NEXT="$STABLE/.current.next"
ROLLBACK="$STABLE/rollback-target.txt"
OUT="$ROOT/plesk-pricing-test-auto-result.txt"
WORK="$ROOT/.pricing-test-auto-deploy"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_URL="${PLESK_TEST_HEALTH_URL:-https://pricing-test.shalean.co.za/api/health/environment}"
WAIT_SECONDS="${PLESK_AUTO_WAIT_SECONDS:-1200}"
POLL_SECONDS="${PLESK_AUTO_POLL_SECONDS:-15}"
EXPECTED_REF="jhubpsbwmjgydkzztxeu"

fail(){
  printf 'PLESK-AUTO-03 ERROR: %s\n' "$*" | tee "$OUT" >&2
  exit 1
}

[ -r "$HEADER" ] || fail "GitHub auth header unreadable"
for x in /usr/bin/curl /usr/bin/python3 /usr/bin/touch /bin/bash; do
  [ -x "$x" ] || fail "required tool missing: $x"
done
case "$WAIT_SECONDS" in *[!0-9]*|'') fail "wait seconds must be numeric" ;; esac
case "$POLL_SECONDS" in *[!0-9]*|'') fail "poll seconds must be numeric" ;; esac
[ "$WAIT_SECONDS" -ge 60 ] || fail "wait seconds must be at least 60"
[ "$POLL_SECONDS" -ge 5 ] || fail "poll seconds must be at least 5"

rm -rf "$WORK"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

ghget(){
  /usr/bin/curl -fsSL     -H "@$HEADER"     -H 'Accept: application/vnd.github+json'     -H 'X-GitHub-Api-Version: 2022-11-28'     "$@"
}

branch_sha(){
  ghget "$API/branches/integration%2Fshalean-release" > "$WORK/branch.json"
  /usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"]["sha"])' "$WORK/branch.json"
}

TARGET_SHA="$(branch_sha)"
case "$TARGET_SHA" in *[!0-9a-f]*|'') fail "invalid release branch SHA" ;; esac
[ "${#TARGET_SHA}" -eq 40 ] || fail "release branch SHA must be 40 chars"
printf 'PLESK-AUTO-03 target=%s\n' "$TARGET_SHA"

# Wait for the exact-SHA artifact workflow. Never fall back to an older success.
ELAPSED=0
RUN_ID=""
while [ "$ELAPSED" -le "$WAIT_SECONDS" ]; do
  ghget "$API/actions/runs?branch=integration%2Fshalean-release&event=push&per_page=50" > "$WORK/runs.json"
  /usr/bin/python3 - "$WORK/runs.json" "$TARGET_SHA" > "$WORK/workflow-state.txt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); target=sys.argv[2]
xs=[
    r for r in d.get("workflow_runs",[])
    if r.get("name")=="Plesk pricing-test standalone artifact"
    and r.get("head_sha")==target
]
if not xs:
    print("missing|||")
else:
    r=xs[0]
    print("found|{}|{}|{}".format(r.get("id",""), r.get("status",""), r.get("conclusion") or ""))
PY
  IFS='|' read -r FOUND RUN_ID STATUS CONCLUSION < "$WORK/workflow-state.txt"
  if [ "$FOUND" = "found" ]; then
    printf 'PLESK-AUTO-03 workflow run=%s status=%s conclusion=%s\n' "$RUN_ID" "$STATUS" "${CONCLUSION:-pending}"
    if [ "$STATUS" = "completed" ]; then
      [ "$CONCLUSION" = "success" ] || fail "exact-SHA artifact workflow completed with $CONCLUSION"
      break
    fi
  else
    printf 'PLESK-AUTO-03 waiting for exact-SHA artifact workflow (%ss/%ss)\n' "$ELAPSED" "$WAIT_SECONDS"
  fi
  [ "$ELAPSED" -lt "$WAIT_SECONDS" ] || fail "timed out waiting for exact-SHA artifact workflow"
  sleep "$POLL_SECONDS"
  ELAPSED=$((ELAPSED + POLL_SECONDS))
done
[ -n "$RUN_ID" ] || fail "exact-SHA workflow run id missing"

# If the branch moved while we waited, stop. A subsequent Plesk auto-deploy will
# process the newer push; this run must never prepare or activate that newer SHA.
[ "$(branch_sha)" = "$TARGET_SHA" ] || fail "release branch moved while waiting; refusing stale activation"

# Prepare/checksum/probe the exact immutable release. This moves the stable
# pointer but does not restart Passenger.
 /bin/bash "$SCRIPT_DIR/plesk-pricing-test-git-prepare.sh" "$TARGET_SHA"
PREPARE_OUT="$ROOT/plesk-pricing-test-prepare-result.txt"
[ -s "$PREPARE_OUT" ] || fail "prepare result missing"
grep -Fxq 'PLESK_AUTO_02A=PASS' "$PREPARE_OUT" || fail "prepare stage did not pass"
grep -Fxq "RELEASE_SHA=$TARGET_SHA" "$PREPARE_OUT" || fail "prepare result SHA mismatch"

CANDIDATE="$ROOT/plesk-pricing-test-${TARGET_SHA:0:8}"
[ -L "$CURRENT" ] || fail "stable current pointer missing"
[ "$(readlink -f "$CURRENT")" = "$CANDIDATE" ] || fail "stable current pointer is not exact candidate"
PREVIOUS="$(cat "$ROLLBACK" 2>/dev/null || true)"

restore_pointer_without_restart(){
  [ -n "$PREVIOUS" ] || return 1
  [ -f "$PREVIOUS/runtime/apps/web/server.js" ] || return 1
  rm -f "$NEXT"
  ln -s "$PREVIOUS" "$NEXT"
  mv -Tf "$NEXT" "$CURRENT"
}

# Re-check immediately before activation. If a newer release appeared during
# preparation, restore the old pointer without restarting and let the new push
# drive its own deployment.
if [ "$(branch_sha)" != "$TARGET_SHA" ]; then
  restore_pointer_without_restart || true
  fail "release branch moved during preparation; activation skipped"
fi

restart_passenger(){
  mkdir -p "$STABLE/tmp"
  /usr/bin/touch "$STABLE/tmp/restart.txt"
}

health_exact(){
  local expected="$1" body="$WORK/health.json" http
  for _ in $(seq 1 30); do
    http="$(/usr/bin/curl -sS -o "$body" -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true)"
    if [ "$http" = "200" ] && /usr/bin/python3 - "$body" "$expected" "$EXPECTED_REF" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); expected=sys.argv[2]; ref=sys.argv[3]
ok=(
    d.get("status")=="ok"
    and d.get("deployment")=="staging"
    and (d.get("supabase") or {}).get("configuredRef")==ref
    and d.get("releaseSha")==expected
)
raise SystemExit(0 if ok else 1)
PY
    then
      return 0
    fi
    sleep 3
  done
  cat "$body" >&2 2>/dev/null || true
  return 1
}

health_rollback(){
  local previous_sha="$1" body="$WORK/rollback-health.json" http
  for _ in $(seq 1 30); do
    http="$(/usr/bin/curl -sS -o "$body" -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true)"
    if [ "$http" = "200" ] && /usr/bin/python3 - "$body" "$previous_sha" "$EXPECTED_REF" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); previous=sys.argv[2]; ref=sys.argv[3]
release=d.get("releaseSha")
ok=(
    d.get("status")=="ok"
    and d.get("deployment")=="staging"
    and (d.get("supabase") or {}).get("configuredRef")==ref
    and (release in (None,"",previous))
)
raise SystemExit(0 if ok else 1)
PY
    then
      return 0
    fi
    sleep 3
  done
  cat "$body" >&2 2>/dev/null || true
  return 1
}

# Activate the already-prepared pointer.
restart_passenger
if health_exact "$TARGET_SHA"; then
  {
    printf 'PLESK_AUTO_03=PASS\n'
    printf 'WORKFLOW_RUN_ID=%s\n' "$RUN_ID"
    printf 'RELEASE_SHA=%s\n' "$TARGET_SHA"
    printf 'CURRENT=%s\n' "$(readlink -f "$CURRENT")"
    printf 'PREVIOUS=%s\n' "$PREVIOUS"
    printf 'HEALTH_URL=%s\n' "$HEALTH_URL"
    printf 'LIVE_ACTIVATION=PERFORMED\n'
  } > "$OUT"
  cat "$OUT"
  exit 0
fi

printf 'PLESK-AUTO-03: candidate public health failed; rolling back\n' >&2
[ -n "$PREVIOUS" ] || fail "candidate unhealthy and no rollback target exists"
[ -f "$PREVIOUS/build-meta.json" ] || fail "rollback build-meta.json missing"
PREVIOUS_SHA="$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["artifact_sha"])' "$PREVIOUS/build-meta.json")"
case "$PREVIOUS_SHA" in *[!0-9a-f]*|'') fail "rollback SHA invalid" ;; esac
[ "${#PREVIOUS_SHA}" -eq 40 ] || fail "rollback SHA must be 40 chars"
restore_pointer_without_restart || fail "rollback target invalid"
restart_passenger
health_rollback "$PREVIOUS_SHA" || fail "rollback runtime also failed public health verification"
fail "candidate activation failed; previous release restored"
