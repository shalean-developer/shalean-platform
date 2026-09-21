#!/bin/bash
set -euo pipefail

# PLESK-PULL-02: stage an already-verified production artifact into a new
# immutable release directory. This script intentionally DOES NOT switch or
# restart the live Plesk Node.js application.
#
# Usage:
#   bash scripts/plesk-stage-release.sh <signed_url> <release_sha> <sha256>
#
# The script is designed for the Plesk subscription chroot where HOME is the
# subscription root (for example /var/www/vhosts/shalean.co.za).

SIGNED_URL="${1:-}"
RELEASE_SHA="${2:-}"
EXPECTED_SHA256="${3:-}"

fail() {
  printf 'PLESK-PULL-02 ERROR: %s\n' "$*" >&2
  exit 1
}

[ -n "$SIGNED_URL" ] || fail "signed artifact URL is required"
[ -n "$RELEASE_SHA" ] || fail "release SHA is required"
[ -n "$EXPECTED_SHA256" ] || fail "artifact SHA-256 is required"

case "$RELEASE_SHA" in
  *[!0-9a-f]*|'') fail "release SHA must be lowercase hexadecimal" ;;
esac
[ "${#RELEASE_SHA}" -eq 40 ] || fail "release SHA must contain exactly 40 characters"

case "$EXPECTED_SHA256" in
  *[!0-9a-f]*|'') fail "artifact SHA-256 must be lowercase hexadecimal" ;;
esac
[ "${#EXPECTED_SHA256}" -eq 64 ] || fail "artifact SHA-256 must contain exactly 64 characters"

SHORT_SHA="${RELEASE_SHA:0:8}"
SUBSCRIPTION_ROOT="${HOME:?HOME is required}"
RELEASE_NAME="plesk-prod-$SHORT_SHA"
RELEASE_DIR="$SUBSCRIPTION_ROOT/$RELEASE_NAME"
WORK_DIR="$SUBSCRIPTION_ROOT/.plesk-release-staging/$RELEASE_SHA"
ARCHIVE="$WORK_DIR/release.tar.gz"
EXTRACT_DIR="$WORK_DIR/extracted"

[ ! -e "$RELEASE_DIR" ] || fail "immutable release already exists: $RELEASE_DIR"

rm -rf "$WORK_DIR"
mkdir -p "$EXTRACT_DIR"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

printf 'PLESK-PULL-02: downloading exact release %s\n' "$RELEASE_SHA"
curl --fail --silent --show-error --location   --proto '=https' --tlsv1.2   "$SIGNED_URL"   --output "$ARCHIVE"

ACTUAL_SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[ "$ACTUAL_SHA256" = "$EXPECTED_SHA256" ] ||   fail "artifact SHA-256 mismatch"

tar -tzf "$ARCHIVE" > "$WORK_DIR/archive-contents.txt"
grep -Fxq './build-meta.json' "$WORK_DIR/archive-contents.txt" ||   grep -Fxq 'build-meta.json' "$WORK_DIR/archive-contents.txt" ||   fail "build-meta.json missing"
grep -Eq '^\./?runtime/apps/web/server\.js$' "$WORK_DIR/archive-contents.txt" ||   fail "runtime/apps/web/server.js missing"
grep -Eq '^\./?runtime/apps/web/\.next/' "$WORK_DIR/archive-contents.txt" ||   fail "runtime/apps/web/.next missing"
grep -Eq '^\./?runtime/apps/web/public/' "$WORK_DIR/archive-contents.txt" ||   fail "runtime/apps/web/public missing"

tar -xzf "$ARCHIVE" -C "$EXTRACT_DIR"

META_FILE="$EXTRACT_DIR/build-meta.json"
[ -f "$META_FILE" ] || fail "extracted build-meta.json missing"
grep -Fq "\"artifact_sha\": \"$RELEASE_SHA\"" "$META_FILE" ||   fail "build-meta artifact_sha does not match requested release"

[ -f "$EXTRACT_DIR/runtime/apps/web/server.js" ] || fail "server.js missing after extraction"
[ -d "$EXTRACT_DIR/runtime/apps/web/.next" ] || fail ".next missing after extraction"
[ -d "$EXTRACT_DIR/runtime/apps/web/public" ] || fail "public missing after extraction"

# Atomic within the same filesystem: only a fully verified extracted tree is
# promoted to the immutable release path.
mv "$EXTRACT_DIR" "$RELEASE_DIR"

# Re-verify the promoted immutable release before reporting success.
[ -f "$RELEASE_DIR/runtime/apps/web/server.js" ] || fail "promoted server.js missing"
[ -d "$RELEASE_DIR/runtime/apps/web/.next" ] || fail "promoted .next missing"
[ -d "$RELEASE_DIR/runtime/apps/web/public" ] || fail "promoted public missing"
grep -Fq "\"artifact_sha\": \"$RELEASE_SHA\"" "$RELEASE_DIR/build-meta.json" ||   fail "promoted build metadata mismatch"

printf 'PLESK-PULL-02 STAGED\n'
printf 'release_sha=%s\n' "$RELEASE_SHA"
printf 'release_dir=%s\n' "$RELEASE_DIR"
printf 'artifact_sha256=%s\n' "$ACTUAL_SHA256"
printf 'activation=NOT_PERFORMED\n'
