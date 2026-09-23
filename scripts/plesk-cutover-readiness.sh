#!/bin/bash
set -euo pipefail

# PLESK-PULL-06: final read-only cutover readiness audit.
# Verifies the prepared stable root, public symlink, exact candidate and frozen
# rollback baseline. It DOES NOT change Plesk configuration or restart Node.
#
# Usage:
#   bash scripts/plesk-cutover-readiness.sh <candidate_sha>

CANDIDATE_SHA="${1:-}"
ROLLBACK_SHORT="e71a591c"
EXPECTED_NODE="/opt/plesk/node/24/bin/node"

fail() {
  printf 'PLESK-PULL-06 ERROR: %s\n' "$*" >&2
  exit 1
}

case "$CANDIDATE_SHA" in
  *[!0-9a-f]*|'') fail "candidate SHA must be lowercase hexadecimal" ;;
esac
[ "${#CANDIDATE_SHA}" -eq 40 ] || fail "candidate SHA must contain exactly 40 characters"

ROOT="${HOME:?HOME is required}"
SHORT_SHA="${CANDIDATE_SHA:0:8}"
CANDIDATE="$ROOT/plesk-prod-$SHORT_SHA"
ROLLBACK="$ROOT/plesk-prod-$ROLLBACK_SHORT"
STABLE="$ROOT/plesk-runtime"
CURRENT="$STABLE/current"
PUBLIC="$STABLE/public"
WRAPPER="$STABLE/server.js"

[ -d "$CANDIDATE" ] || fail "candidate release missing"
[ -f "$CANDIDATE/build-meta.json" ] || fail "candidate build metadata missing"
grep -Fq "\"artifact_sha\": \"$CANDIDATE_SHA\"" "$CANDIDATE/build-meta.json" ||   fail "candidate metadata SHA mismatch"
[ -f "$CANDIDATE/runtime/apps/web/server.js" ] || fail "candidate server.js missing"
[ -d "$CANDIDATE/runtime/apps/web/.next" ] || fail "candidate .next missing"
[ -d "$CANDIDATE/runtime/apps/web/public" ] || fail "candidate public missing"

[ -d "$ROLLBACK" ] || fail "frozen rollback release missing"
[ -f "$ROLLBACK/runtime/apps/web/server.js" ] || fail "rollback server.js missing"
[ -d "$ROLLBACK/runtime/apps/web/.next" ] || fail "rollback .next missing"
[ -d "$ROLLBACK/runtime/apps/web/public" ] || fail "rollback public missing"

[ -L "$CURRENT" ] || fail "stable current is not a symbolic link"
CURRENT_TARGET="$(readlink -f "$CURRENT")"
[ "$CURRENT_TARGET" = "$CANDIDATE" ] || fail "stable current does not target exact candidate"

[ -f "$WRAPPER" ] || fail "stable startup wrapper missing"
[ -L "$PUBLIC" ] || fail "stable public is not a symbolic link"
PUBLIC_TARGET="$(readlink -f "$PUBLIC")"
EXPECTED_PUBLIC="$CANDIDATE/runtime/apps/web/public"
[ "$PUBLIC_TARGET" = "$EXPECTED_PUBLIC" ] || fail "stable public symlink target mismatch"

[ -x "$EXPECTED_NODE" ] || fail "Plesk Node 24 binary missing"

# The wrapper must delegate through current and not hard-code an immutable SHA.
grep -Fq "path.join(stableRoot, 'current')" "$WRAPPER" || fail "stable wrapper does not resolve current pointer"
if grep -Fq "$SHORT_SHA" "$WRAPPER"; then
  fail "stable wrapper hard-codes candidate release"
fi

# Resolve representative public assets through the stable document root.
PUBLIC_COUNT="$(find -L "$PUBLIC" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
[ "$PUBLIC_COUNT" -gt 0 ] || fail "stable public root resolves but contains no top-level files"

printf 'PLESK-PULL-06 READINESS PASS\n'
printf 'candidate_sha=%s\n' "$CANDIDATE_SHA"
printf 'candidate=%s\n' "$CANDIDATE"
printf 'stable_root=%s\n' "$STABLE"
printf 'stable_current=%s\n' "$CURRENT_TARGET"
printf 'stable_public=%s\n' "$PUBLIC_TARGET"
printf 'rollback_root=%s\n' "$ROLLBACK"
printf 'node=%s\n' "$EXPECTED_NODE"
printf 'planned_application_root=/plesk-runtime\n'
printf 'planned_document_root=/plesk-runtime/public\n'
printf 'planned_startup_file=server.js\n'
printf 'planned_mode=production\n'
printf 'production_activation=NOT_PERFORMED\n'
