#!/bin/bash
set -euo pipefail

# PLESK-PULL-02 stable consumer.
# Downloads the guarded pull bundle for the current integration/shalean-release
# head from GitHub, then delegates immutable staging to plesk-stage-release.sh.
# No production activation or Node restart is performed.
#
# Required environment:
#   GH_TOKEN  - fine-grained/read-only token able to read Actions artifacts
# Optional:
#   GITHUB_REPOSITORY (default shalean-developer/shalean-platform)

REPO="${GITHUB_REPOSITORY:-shalean-developer/shalean-platform}"
TOKEN="${GH_TOKEN:-}"

fail() {
  printf 'PLESK-PULL-02 ERROR: %s\n' "$*" >&2
  exit 1
}

[ -n "$TOKEN" ] || fail "GH_TOKEN is required"

command -v curl >/dev/null || fail "curl is required"
command -v unzip >/dev/null || fail "unzip is required"
command -v python3 >/dev/null || fail "python3 is required"

WORK_DIR="${HOME:?HOME is required}/.plesk-pull-bundle"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

API="https://api.github.com/repos/$REPO"
AUTH="Authorization: Bearer $TOKEN"
ACCEPT="Accept: application/vnd.github+json"
VERSION="X-GitHub-Api-Version: 2022-11-28"

printf 'PLESK-PULL-02: resolving current release head\n'
BRANCH_JSON="$(curl --fail --silent --show-error --location   -H "$AUTH" -H "$ACCEPT" -H "$VERSION"   "$API/branches/integration%2Fshalean-release")"
RELEASE_SHA="$(printf '%s' "$BRANCH_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["commit"]["sha"])')"
[ "${#RELEASE_SHA}" -eq 40 ] || fail "could not resolve 40-character release SHA"

ARTIFACT_NAME="plesk-pull-$RELEASE_SHA"
printf 'PLESK-PULL-02: resolving guarded bundle %s\n' "$ARTIFACT_NAME"
ARTIFACTS_JSON="$(curl --fail --silent --show-error --location   -H "$AUTH" -H "$ACCEPT" -H "$VERSION"   "$API/actions/artifacts?name=$ARTIFACT_NAME&per_page=100")"

read -r ARTIFACT_ID EXPIRED < <(printf '%s' "$ARTIFACTS_JSON" | python3 -c '
import json,sys
items=json.load(sys.stdin).get("artifacts", [])
items=[x for x in items if x.get("name")==sys.argv[1]]
items.sort(key=lambda x:x.get("created_at",""))
if not items:
    raise SystemExit(2)
x=items[-1]
print(x["id"], str(bool(x.get("expired"))).lower())
' "$ARTIFACT_NAME") || fail "guarded pull bundle not found"

[ "$EXPIRED" = "false" ] || fail "guarded pull bundle is expired"

curl --fail --silent --show-error --location   -H "$AUTH" -H "$ACCEPT" -H "$VERSION"   "$API/actions/artifacts/$ARTIFACT_ID/zip"   --output "$WORK_DIR/bundle.zip"

unzip -q "$WORK_DIR/bundle.zip" -d "$WORK_DIR/bundle"

URL_FILE="$WORK_DIR/bundle/plesk-pull-url.txt"
SUM_FILE="$WORK_DIR/bundle/release.tar.gz.sha256"
META_FILE="$WORK_DIR/bundle/build-meta.json"

[ -s "$URL_FILE" ] || fail "signed URL missing from bundle"
[ -s "$SUM_FILE" ] || fail "SHA-256 file missing from bundle"
[ -s "$META_FILE" ] || fail "build metadata missing from bundle"

META_SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["artifact_sha"])' "$META_FILE")"
[ "$META_SHA" = "$RELEASE_SHA" ] || fail "bundle metadata SHA does not match current release head"

SIGNED_URL="$(cat "$URL_FILE")"
EXPECTED_SHA256="$(awk '{print $1}' "$SUM_FILE")"
[ "${#EXPECTED_SHA256}" -eq 64 ] || fail "invalid artifact SHA-256"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec bash "$SCRIPT_DIR/plesk-stage-release.sh"   "$SIGNED_URL"   "$RELEASE_SHA"   "$EXPECTED_SHA256"
