#!/bin/bash
set -euo pipefail

# PLESK-AUTO-01: Plesk Git post-pull runner for pricing-test.
# The Plesk Git repository is the trusted trigger only; live files are never
# deployed from the source checkout. Instead this script resolves the exact
# integration head, downloads the matching GitHub Actions standalone artifact,
# stages it immutably, probes it locally, and prepares the stable pointer.
#
# Activation/restart remains a separate gated step until PLESK-AUTO-02.
#
# Required environment:
#   GH_TOKEN - read-only GitHub token able to read Actions artifacts
# Optional:
#   GITHUB_REPOSITORY (default shalean-developer/shalean-platform)
#   NODE_BIN (default /opt/plesk/node/24/bin/node)

REPO="${GITHUB_REPOSITORY:-shalean-developer/shalean-platform}"
TOKEN="${GH_TOKEN:-}"
ROOT="${HOME:?HOME is required}"
NODE_BIN="${NODE_BIN:-/opt/plesk/node/24/bin/node}"

fail(){ printf 'PLESK-AUTO-01 ERROR: %s\n' "$*" >&2; exit 1; }
[ -n "$TOKEN" ] || fail "GH_TOKEN is required"
command -v curl >/dev/null || fail "curl is required"
command -v unzip >/dev/null || fail "unzip is required"
command -v tar >/dev/null || fail "tar is required"
command -v python3 >/dev/null || fail "python3 is required"
[ -x "$NODE_BIN" ] || fail "Node 24 binary missing"

API="https://api.github.com/repos/$REPO"
AUTH="Authorization: Bearer $TOKEN"
ACCEPT="Accept: application/vnd.github+json"
VERSION="X-GitHub-Api-Version: 2022-11-28"
WORK="$ROOT/.pricing-test-auto"
rm -rf "$WORK"; mkdir -p "$WORK"; trap 'rm -rf "$WORK"' EXIT

BRANCH_JSON="$(curl -fsSL -H "$AUTH" -H "$ACCEPT" -H "$VERSION" "$API/branches/integration%2Fshalean-release")"
SHA="$(printf '%s' "$BRANCH_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["commit"]["sha"])')"
[ "${#SHA}" -eq 40 ] || fail "could not resolve release SHA"
SHORT="${SHA:0:8}"
NAME="plesk-pricing-test-$SHA"

ART_JSON="$(curl -fsSL -H "$AUTH" -H "$ACCEPT" -H "$VERSION" "$API/actions/artifacts?name=$NAME&per_page=100")"
ART_ID="$(printf '%s' "$ART_JSON" | python3 -c 'import json,sys; a=[x for x in json.load(sys.stdin).get("artifacts",[]) if not x.get("expired") and x.get("name")==sys.argv[1] and x.get("workflow_run",{}).get("head_sha")==sys.argv[2]]; a.sort(key=lambda x:x.get("created_at","")); print(a[-1]["id"] if a else "")' "$NAME" "$SHA")"
[ -n "$ART_ID" ] || fail "exact pricing-test artifact not found for $SHA"

curl -fsSL -H "$AUTH" -H "$ACCEPT" -H "$VERSION" "$API/actions/artifacts/$ART_ID/zip" -o "$WORK/artifact.zip"
unzip -q "$WORK/artifact.zip" -d "$WORK/artifact"
ARCHIVE="$WORK/artifact/$NAME.tar.gz"
[ -f "$ARCHIVE" ] || fail "artifact archive missing"

RELEASE="$ROOT/plesk-pricing-test-$SHORT"
if [ ! -e "$RELEASE" ]; then
  mkdir -p "$WORK/extracted"
  tar -tzf "$ARCHIVE" > "$WORK/contents"
  grep -Eq '^\./?build-meta\.json$' "$WORK/contents" || fail "build-meta missing"
  grep -Eq '^\./?runtime/apps/web/server\.js$' "$WORK/contents" || fail "server.js missing"
  tar -xzf "$ARCHIVE" -C "$WORK/extracted"
  grep -Fq "\"artifact_sha\":\"$SHA\"" "$WORK/extracted/build-meta.json" || grep -Fq "\"artifact_sha\": \"$SHA\"" "$WORK/extracted/build-meta.json" || fail "artifact SHA mismatch"
  [ -d "$WORK/extracted/runtime/apps/web/.next" ] || fail ".next missing"
  [ -d "$WORK/extracted/runtime/apps/web/public" ] || fail "public missing"
  mv "$WORK/extracted" "$RELEASE"
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
[ "$ok" = true ] || { tail -n 100 "$LOG" >&2 || true; fail "candidate local health probe failed"; }
cleanup_pid
trap 'rm -rf "$WORK"' EXIT

STABLE="$ROOT/pricing-test-runtime"
mkdir -p "$STABLE"
CURRENT="$STABLE/current"
NEXT="$STABLE/.current.next"
ROLLBACK="$STABLE/rollback-target.txt"
PREVIOUS=""
if [ -L "$CURRENT" ]; then PREVIOUS="$(readlink -f "$CURRENT")"; elif [ -e "$CURRENT" ]; then fail "stable current exists but is not symlink"; fi
printf '%s\n' "$PREVIOUS" > "$ROLLBACK"

cat > "$STABLE/server.js" <<'EOF'
'use strict';
const fs=require('fs'); const path=require('path');
const current=path.join(__dirname,'current');
let resolved; try { resolved=fs.realpathSync(current); } catch(e) { console.error(e.message); process.exit(1); }
const server=path.join(resolved,'runtime','apps','web','server.js');
if(!fs.existsSync(server)){ console.error('Missing candidate server.js'); process.exit(1); }
process.chdir(path.dirname(server)); require(server);
EOF
rm -f "$NEXT"; ln -s "$RELEASE" "$NEXT"; mv -Tf "$NEXT" "$CURRENT"
rm -f "$STABLE/public"; ln -s "current/runtime/apps/web/public" "$STABLE/public"

printf 'PLESK-AUTO-01 PREPARED\n'
printf 'release_sha=%s\nrelease=%s\nstable=%s\ncurrent=%s\n' "$SHA" "$RELEASE" "$STABLE" "$(readlink -f "$CURRENT")"
printf 'live_activation=NOT_PERFORMED\n'
