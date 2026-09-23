#!/bin/bash
set -euo pipefail

# PLESK-PULL-05: prepare a stable production application root and rollback
# controls WITHOUT changing the live Plesk Node.js Application Root.
#
# Usage:
#   bash scripts/plesk-prepare-stable-runtime.sh <release_sha>
#
# Creates:
#   $HOME/plesk-runtime/
#     current -> ../plesk-prod-<short-sha>
#     server.js                 stable startup wrapper
#     public -> current/runtime/apps/web/public
#     rollback-target.txt       previous verified target (if any)
#
# The live Plesk configuration is intentionally untouched.

RELEASE_SHA="${1:-}"

fail() {
  printf 'PLESK-PULL-05 ERROR: %s\n' "$*" >&2
  exit 1
}

case "$RELEASE_SHA" in
  *[!0-9a-f]*|'') fail "release SHA must be lowercase hexadecimal" ;;
esac
[ "${#RELEASE_SHA}" -eq 40 ] || fail "release SHA must contain exactly 40 characters"

ROOT="${HOME:?HOME is required}"
SHORT_SHA="${RELEASE_SHA:0:8}"
RELEASE_DIR="$ROOT/plesk-prod-$SHORT_SHA"
APP_DIR="$RELEASE_DIR/runtime/apps/web"
META_FILE="$RELEASE_DIR/build-meta.json"
STABLE_DIR="$ROOT/plesk-runtime"
CURRENT="$STABLE_DIR/current"
NEXT="$STABLE_DIR/.current.next"
ROLLBACK_FILE="$STABLE_DIR/rollback-target.txt"

[ -d "$RELEASE_DIR" ] || fail "staged release missing: $RELEASE_DIR"
[ -f "$META_FILE" ] || fail "build-meta.json missing"
[ -f "$APP_DIR/server.js" ] || fail "candidate server.js missing"
[ -d "$APP_DIR/.next" ] || fail "candidate .next missing"
[ -d "$APP_DIR/public" ] || fail "candidate public missing"
grep -Fq "\"artifact_sha\": \"$RELEASE_SHA\"" "$META_FILE" ||   fail "candidate metadata SHA mismatch"

mkdir -p "$STABLE_DIR"

PREVIOUS=""
if [ -L "$CURRENT" ]; then
  PREVIOUS="$(readlink "$CURRENT")"
elif [ -e "$CURRENT" ]; then
  fail "stable current path exists but is not a symbolic link"
fi
printf '%s\n' "$PREVIOUS" > "$ROLLBACK_FILE"

cat > "$STABLE_DIR/server.js" <<'EOF'
'use strict';

const fs = require('fs');
const path = require('path');

const stableRoot = __dirname;
const current = path.join(stableRoot, 'current');
let resolved;
try {
  resolved = fs.realpathSync(current);
} catch (error) {
  console.error('Stable runtime current pointer is unavailable:', error.message);
  process.exit(1);
}

const candidateServer = path.join(resolved, 'runtime', 'apps', 'web', 'server.js');
if (!fs.existsSync(candidateServer)) {
  console.error('Candidate server.js is unavailable:', candidateServer);
  process.exit(1);
}

process.chdir(path.dirname(candidateServer));
require(candidateServer);
EOF

rm -f "$NEXT"
ln -s "$RELEASE_DIR" "$NEXT"
mv -Tf "$NEXT" "$CURRENT"

rm -f "$STABLE_DIR/public"
ln -s "current/runtime/apps/web/public" "$STABLE_DIR/public"

RESOLVED="$(readlink -f "$CURRENT")"
[ "$RESOLVED" = "$RELEASE_DIR" ] || fail "stable current pointer resolution mismatch"
[ -f "$STABLE_DIR/server.js" ] || fail "stable startup wrapper missing"
[ -d "$STABLE_DIR/public" ] || fail "stable public link invalid"

printf 'PLESK-PULL-05 PREPARED\n'
printf 'release_sha=%s\n' "$RELEASE_SHA"
printf 'stable_root=%s\n' "$STABLE_DIR"
printf 'current_target=%s\n' "$RESOLVED"
printf 'startup_file=server.js\n'
printf 'document_root=public\n'
printf 'production_activation=NOT_PERFORMED\n'
