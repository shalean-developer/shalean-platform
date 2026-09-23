#!/bin/bash
set -euo pipefail

# PLESK-AUTO-02A: resolve the latest successful pricing-test release through
# GitHub Actions, download its short-lived bootstrap, then prepare and health
# probe the exact private release. Live Node activation is not performed.

ROOT="${HOME:?HOME is required}"
NODE_BIN="${NODE_BIN:-/opt/plesk/node/24/bin/node}"
REPO="shalean-developer/shalean-platform"
HEADER="$ROOT/.plesk-secrets/github-actions-auth-header"
fail(){ printf 'PLESK-AUTO-02A ERROR: %s\n' "$*" >&2; exit 1; }

[ -r "$HEADER" ] || fail "GitHub authorization header unreadable"
[ -x "$NODE_BIN" ] || fail "Node 24 binary missing"
for CMD in curl python3 unzip tar sha256sum; do command -v "$CMD" >/dev/null || fail "$CMD missing"; done

BOOT="$ROOT/.pricing-test-bootstrap"
rm -rf "$BOOT"; mkdir -p "$BOOT"
trap 'rm -rf "$BOOT"' EXIT

RUNS="$BOOT/runs.json"
HTTP="$(curl -sS -o "$RUNS" -w '%{http_code}' -H "@$HEADER" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "https://api.github.com/repos/$REPO/actions/runs?branch=integration%2Fshalean-release&event=push&per_page=20")"
[ "$HTTP" = 200 ] || fail "workflow lookup failed HTTP $HTTP"
read -r RUN_ID RELEASE_SHA < <(python3 - "$RUNS" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
runs=[r for r in d.get("workflow_runs",[]) if r.get("name")=="Plesk pricing-test standalone artifact" and r.get("status")=="completed" and r.get("conclusion")=="success"]
if not runs: raise SystemExit(1)
r=runs[0]; print(r["id"],r["head_sha"])
PY
)
[ "${#RELEASE_SHA}" -eq 40 ] || fail "invalid release SHA"

ARTS="$BOOT/artifacts.json"
HTTP="$(curl -sS -o "$ARTS" -w '%{http_code}' -H "@$HEADER" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "https://api.github.com/repos/$REPO/actions/runs/$RUN_ID/artifacts")"
[ "$HTTP" = 200 ] || fail "artifact lookup failed HTTP $HTTP"
ART_ID="$(python3 - "$ARTS" "$RELEASE_SHA" <<'PY'
import json,sys
name="plesk-pricing-test-bootstrap-"+sys.argv[2]
a=[x for x in json.load(open(sys.argv[1])).get("artifacts",[]) if x.get("name")==name and not x.get("expired")]
if len(a)!=1: raise SystemExit(1)
print(a[0]["id"])
PY
)"
HTTP="$(curl -sSL -o "$BOOT/bootstrap.zip" -w '%{http_code}' -H "@$HEADER" -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "https://api.github.com/repos/$REPO/actions/artifacts/$ART_ID/zip")"
[ "$HTTP" = 200 ] || fail "bootstrap download failed HTTP $HTTP"
unzip -q "$BOOT/bootstrap.zip" -d "$BOOT/unpacked"
MANIFEST="$BOOT/unpacked/bootstrap.json"
[ -s "$MANIFEST" ] || fail "bootstrap manifest missing"
PULL="$BOOT/pull"; mkdir -p "$PULL"
python3 - "$MANIFEST" "$RELEASE_SHA" "$PULL" <<'PY'
import json,sys,urllib.request
m=json.load(open(sys.argv[1])); sha=sys.argv[2]; out=sys.argv[3]
if m.get("release_sha") != sha: raise SystemExit("bootstrap SHA mismatch")
for name in ("url.txt","release.sha256","build-meta.json"):
    url=m.get("files",{}).get(name)
    if not isinstance(url,str) or not url.startswith("https://"): raise SystemExit("invalid signed URL")
    with urllib.request.urlopen(url,timeout=30) as r, open(out+"/"+name,"wb") as f: f.write(r.read())
PY
URL_FILE="$PULL/url.txt"
SUM_FILE="$PULL/release.sha256"
META_FILE="$PULL/build-meta.json"
[ -s "$URL_FILE" ] || fail "guarded signed URL missing"
[ -s "$SUM_FILE" ] || fail "guarded checksum missing"
[ -s "$META_FILE" ] || fail "guarded build metadata missing"

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
