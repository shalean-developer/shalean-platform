#!/bin/bash
set -euo pipefail

# Scheduled worker for webhook-triggered production deployments.
# Runs quickly when there is no request. A failed deployment leaves the marker
# in place so the next scheduled run retries safely.
ROOT="${HOME:-/var/www/vhosts/shalean.co.za}"
REQUEST="$ROOT/.plesk-production-deploy-request"
SCRIPT="$ROOT/plesk-git-production/scripts/plesk-production-auto-deploy.sh"
RESULT="$ROOT/plesk-production-auto-result.txt"

[ -f "$REQUEST" ] || {
  echo "PLESK_PROD_WORKER=IDLE"
  exit 0
}
[ -f "$SCRIPT" ] || {
  echo "PLESK_PROD_WORKER=ERROR"
  echo "REASON=DEPLOY_SCRIPT_MISSING"
  exit 1
}

echo "PLESK_PROD_WORKER=REQUEST_FOUND"
cat "$REQUEST" || true

/bin/bash "$SCRIPT"

if grep -Fxq 'PLESK_PROD_AUTO_05=PASS' "$RESULT" 2>/dev/null; then
  rm -f "$REQUEST"
  echo "PLESK_PROD_WORKER=PASS"
  exit 0
fi

echo "PLESK_PROD_WORKER=RETRY_PENDING"
exit 1
