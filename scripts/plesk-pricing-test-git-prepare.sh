#!/bin/bash
set -euo pipefail

# PLESK-AUTO-02A — guarded pricing-test preparation.
# Resolves the exact successful pricing-test push workflow for the current
# release head (or an explicitly supplied expected SHA), downloads its
# bootstrap artifact using the protected read-only GitHub header, follows only
# short-lived signed Supabase URLs, verifies checksum/build metadata, probes
# the candidate locally, and prepares a stable pointer.
# It NEVER restarts or reconfigures the live Plesk Node application.

ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
HEADER="$ROOT/.plesk-secrets/github-actions-auth-header"
REPO="shalean-developer/shalean-platform"
API="https://api.github.com/repos/$REPO"
NODE_BIN="${NODE_BIN:-/opt/plesk/node/24/bin/node}"
STABLE="$ROOT/pricing-test-runtime"
WORK="$ROOT/.pricing-test-release-staging"
OUT="$ROOT/plesk-pricing-test-prepare-result.txt"
EXPECTED_SHA="${1:-}"

fail(){ printf 'PLESK-AUTO-02A ERROR: %s\n' "$*" | tee "$OUT" >&2; exit 1; }
if [ -n "$EXPECTED_SHA" ]; then
  case "$EXPECTED_SHA" in *[!0-9a-f]*|'') fail "expected SHA must be lowercase hexadecimal" ;; esac
  [ "${#EXPECTED_SHA}" -eq 40 ] || fail "expected SHA must be 40 chars"
fi
[ -r "$HEADER" ] || fail "GitHub auth header unreadable"
[ -x "$NODE_BIN" ] || fail "Node 24 binary missing"
for x in /usr/bin/curl /usr/bin/python3 /usr/bin/unzip /usr/bin/tar /usr/bin/sha256sum; do [ -x "$x" ] || fail "required tool missing: $x"; done
rm -rf "$WORK"; mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

ghget(){ /usr/bin/curl -fsSL --connect-timeout 10 --max-time 30 -H "@$HEADER" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "$@"; }

# Resolve the current release head first. Automatic deployment passes this same
# SHA explicitly so a later branch movement can never activate the wrong build.
ghget "$API/branches/integration%2Fshalean-release" > "$WORK/branch.json"
BRANCH_SHA="$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"]["sha"])' "$WORK/branch.json")"
TARGET_SHA="${EXPECTED_SHA:-$BRANCH_SHA}"
[ "$TARGET_SHA" = "$BRANCH_SHA" ] || fail "expected release SHA is not current release head"

# Resolve the successful pricing-test workflow for exactly TARGET_SHA.
ghget "$API/actions/runs?branch=integration%2Fshalean-release&event=push&status=success&per_page=50" > "$WORK/runs.json"
/usr/bin/python3 - "$WORK/runs.json" "$TARGET_SHA" > "$WORK/release.txt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); target=sys.argv[2]
xs=[
    r for r in d.get("workflow_runs",[])
    if r.get("name")=="Plesk pricing-test standalone artifact"
    and r.get("conclusion")=="success"
    and r.get("head_sha")==target
]
if not xs: raise SystemExit("no successful pricing-test workflow for exact release SHA")
r=xs[0]
print(r["id"]); print(r["head_sha"])
PY
RUN_ID="$(sed -n '1p' "$WORK/release.txt")"
SHA="$(sed -n '2p' "$WORK/release.txt")"
case "$SHA" in *[!0-9a-f]*|'') fail "invalid workflow SHA" ;; esac
[ "${#SHA}" -eq 40 ] || fail "workflow SHA must be 40 chars"
[ "$SHA" = "$TARGET_SHA" ] || fail "resolved workflow SHA does not match target release"

# Resolve exact bootstrap artifact for this run/SHA.
ghget "$API/actions/runs/$RUN_ID/artifacts?per_page=100" > "$WORK/artifacts.json"
/usr/bin/python3 - "$WORK/artifacts.json" "$SHA" > "$WORK/artifact-id.txt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); sha=sys.argv[2]
name="plesk-pricing-test-bootstrap-"+sha
xs=[a for a in d.get("artifacts",[]) if a.get("name")==name and not a.get("expired")]
if len(xs)!=1: raise SystemExit("expected exactly one bootstrap artifact")
print(xs[0]["id"])
PY
ART_ID="$(cat "$WORK/artifact-id.txt")"
ghget "$API/actions/artifacts/$ART_ID/zip" > "$WORK/bootstrap.zip"
/usr/bin/unzip -q "$WORK/bootstrap.zip" -d "$WORK/bootstrap"
BOOT="$WORK/bootstrap/bootstrap.json"
[ -s "$BOOT" ] || fail "bootstrap.json missing"

/usr/bin/python3 - "$BOOT" "$SHA" "$WORK" <<'PY'
import json,sys,urllib.parse
p,sha,out=sys.argv[1:]
d=json.load(open(p))
if d.get("release_sha")!=sha: raise SystemExit("bootstrap SHA mismatch")
files=d.get("files",{})
expected={"url.txt","release.sha256","build-meta.json"}
if set(files)!=expected: raise SystemExit("unexpected bootstrap file set")
for k,v in files.items():
    u=urllib.parse.urlparse(v)
    if u.scheme!="https" or not u.hostname or not u.hostname.endswith(".supabase.co"):
        raise SystemExit("invalid signed metadata URL")
    open(out+"/"+k+".signed","w").write(v)
PY

# Download the three signed metadata files without exposing URLs in logs.
for FILE in url.txt release.sha256 build-meta.json; do
  URL="$(cat "$WORK/$FILE.signed")"
  /usr/bin/curl -fsSL --proto '=https' --tlsv1.2 "$URL" -o "$WORK/$FILE"
done

META_SHA="$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["artifact_sha"])' "$WORK/build-meta.json")"
[ "$META_SHA" = "$SHA" ] || fail "build-meta SHA mismatch"
EXPECTED="$(awk '{print $1}' "$WORK/release.sha256")"
case "$EXPECTED" in *[!0-9a-f]*|'') fail "invalid checksum" ;; esac
[ "${#EXPECTED}" -eq 64 ] || fail "checksum length invalid"

RUNTIME_URL="$(cat "$WORK/url.txt")"
/usr/bin/python3 - "$RUNTIME_URL" <<'PY'
import sys,urllib.parse
u=urllib.parse.urlparse(sys.argv[1])
if u.scheme!="https" or not u.hostname or not u.hostname.endswith(".supabase.co"):
    raise SystemExit("invalid runtime URL")
PY
/usr/bin/curl -fsSL --proto '=https' --tlsv1.2 "$RUNTIME_URL" -o "$WORK/release.tar.gz"
ACTUAL="$(/usr/bin/sha256sum "$WORK/release.tar.gz" | awk '{print $1}')"
[ "$ACTUAL" = "$EXPECTED" ] || fail "runtime checksum mismatch"

/usr/bin/tar -tzf "$WORK/release.tar.gz" > "$WORK/contents"
grep -Eq '^\./?build-meta\.json$' "$WORK/contents" || fail "runtime build-meta missing"
grep -Eq '^\./?runtime/apps/web/server\.js$' "$WORK/contents" || fail "runtime server.js missing"
SHORT="${SHA:0:8}"
RELEASE="$ROOT/plesk-pricing-test-$SHORT"
if [ ! -e "$RELEASE" ]; then
  mkdir "$WORK/extracted"
  /usr/bin/tar -xzf "$WORK/release.tar.gz" -C "$WORK/extracted"
  cmp -s "$WORK/build-meta.json" "$WORK/extracted/build-meta.json" || fail "artifact metadata mismatch"
  [ -d "$WORK/extracted/runtime/apps/web/.next" ] || fail ".next missing"
  [ -d "$WORK/extracted/runtime/apps/web/public" ] || fail "public missing"
  mv "$WORK/extracted" "$RELEASE"
fi

# Candidate-only loopback health probe.
APP="$RELEASE/runtime/apps/web"; PORT=3221; LOG="$WORK/probe.log"
( cd "$APP"; HOSTNAME=127.0.0.1 PORT="$PORT" "$NODE_BIN" server.js ) >"$LOG" 2>&1 &
PID=$!
cleanup(){ kill "$PID" >/dev/null 2>&1 || true; wait "$PID" >/dev/null 2>&1 || true; }
trap 'cleanup; rm -rf "$WORK"' EXIT
OK=false
for _ in $(seq 1 20); do
  if /usr/bin/curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then OK=true; break; fi
  kill -0 "$PID" >/dev/null 2>&1 || break
  sleep 2
done
[ "$OK" = true ] || { tail -n 80 "$LOG" >&2 || true; fail "candidate health probe failed"; }
cleanup
trap 'rm -rf "$WORK"' EXIT

# Prepare stable pointer only. Live Plesk app root remains unchanged.
mkdir -p "$STABLE"
CURRENT="$STABLE/current"; NEXT="$STABLE/.current.next"
PREVIOUS=""
if [ -L "$CURRENT" ]; then PREVIOUS="$(readlink -f "$CURRENT")"; elif [ -e "$CURRENT" ]; then fail "stable current is not symlink"; fi
printf '%s\n' "$PREVIOUS" > "$STABLE/rollback-target.txt"
cat > "$STABLE/server.js" <<'EOF'
'use strict';
const fs=require('fs'),path=require('path');
const resolved=fs.realpathSync(path.join(__dirname,'current'));
const metaPath=path.join(resolved,'build-meta.json');
const server=path.join(resolved,'runtime','apps','web','server.js');
if(!fs.existsSync(metaPath)){console.error('Missing candidate build-meta.json');process.exit(1);}
if(!fs.existsSync(server)){console.error('Missing candidate server.js');process.exit(1);}
let meta;
try { meta=JSON.parse(fs.readFileSync(metaPath,'utf8')); } catch(e) { console.error('Invalid candidate build-meta.json'); process.exit(1); }
if(!meta.artifact_sha){console.error('Missing candidate artifact SHA');process.exit(1);}
process.env.SHALEAN_RELEASE_SHA=String(meta.artifact_sha);
process.chdir(path.dirname(server)); require(server);
EOF
rm -f "$NEXT"; ln -s "$RELEASE" "$NEXT"; mv -Tf "$NEXT" "$CURRENT"
rm -f "$STABLE/public"; ln -s "current/runtime/apps/web/public" "$STABLE/public"

{
  printf 'PLESK_AUTO_02A=PASS\n'
  printf 'RELEASE_SHA=%s\n' "$SHA"
  printf 'RELEASE=%s\n' "$RELEASE"
  printf 'CURRENT=%s\n' "$(readlink -f "$CURRENT")"
  printf 'LIVE_ACTIVATION=NOT_PERFORMED\n'
} > "$OUT"
cat "$OUT"
