#!/bin/bash
set -euo pipefail

# Fast Plesk Git post-deployment hook.
# It only records that production has changed; the scheduled worker performs
# the long artifact deployment outside Plesk's post-deploy timeout.
ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
REQUEST="$ROOT/.plesk-production-deploy-request"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TMP="$REQUEST.tmp"

printf 'REQUESTED_AT=%s\n' "$STAMP" > "$TMP"
mv -f "$TMP" "$REQUEST"
echo "PLESK_PROD_WEBHOOK_QUEUE=QUEUED"
echo "REQUESTED_AT=$STAMP"
