#!/bin/bash
set -euo pipefail

ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
HEADER="$ROOT/.plesk-secrets/github-actions-auth-header"
OUT="$ROOT/plesk-github-token-probe.txt"
REPO="shalean-developer/shalean-platform"

[ -r "$HEADER" ] || { printf 'ERROR=auth_header_unreadable\n' > "$OUT"; exit 1; }

# Resolve the latest successful pricing-test push workflow run without printing
# or interpolating the token into the Plesk deployment-action command.
TMP="$ROOT/.plesk-github-token-probe.json"
HTTP="$(/usr/bin/curl -sS -o "$TMP" -w '%{http_code}' \
  -H "@$HEADER" \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/$REPO/actions/runs?branch=integration%2Fshalean-release&event=push&per_page=10")"

printf 'HTTP=%s\n' "$HTTP" > "$OUT"
[ "$HTTP" = "200" ] || exit 1

/usr/bin/python3 - "$TMP" >> "$OUT" <<'PY'
import json, sys
data=json.load(open(sys.argv[1]))
runs=[r for r in data.get("workflow_runs",[]) if r.get("name")=="Plesk pricing-test standalone artifact"]
if not runs:
    print("WORKFLOW=missing")
    raise SystemExit(1)
r=runs[0]
print("WORKFLOW=found")
print("STATUS="+str(r.get("status","")))
print("CONCLUSION="+str(r.get("conclusion","")))
print("HEAD_SHA="+str(r.get("head_sha","")))
PY
rm -f "$TMP"
