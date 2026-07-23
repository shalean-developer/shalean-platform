#!/usr/bin/env bash
# Pull ONLY GSC_* from Vercel Production into a temp env file and run SEO-FIX-001/002 validation.
# Never commits credentials. Deletes the temp file on exit.
# Requires: vercel CLI auth via VERCEL_TOKEN or `vercel login`.
set -euo pipefail

CONFIRM_PHRASE="SEO-FIX-001/002-GSC-ONLY"
MODE="${1:-validate}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_ENV="$(mktemp "${TMPDIR:-/tmp}/gsc-prod-XXXXXX.env")"
cleanup() {
  rm -f "$TMP_ENV"
}
trap cleanup EXIT

if [[ "$MODE" != "validate" && "$MODE" != "inspect-only" ]]; then
  echo "Usage: $0 [validate|inspect-only]" >&2
  exit 2
fi

cd "$ROOT"

if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel CLI not found on PATH" >&2
  exit 2
fi

# Pull production env (full file), then extract only GSC_* names into TMP_ENV.
PULL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vercel-pull-XXXXXX")"
cleanup_all() {
  rm -f "$TMP_ENV"
  rm -rf "$PULL_DIR"
}
trap cleanup_all EXIT

echo "[info] Pulling Vercel Production env (values not printed)…"
vercel pull --yes --environment=production --cwd "$PULL_DIR" >/dev/null

ENV_FILE=""
for candidate in \
  "$PULL_DIR/.vercel/.env.production.local" \
  "$PULL_DIR/.env.production.local" \
  "$PULL_DIR/.vercel/.env.local"
do
  if [[ -f "$candidate" ]]; then
    ENV_FILE="$candidate"
    break
  fi
done

if [[ -z "$ENV_FILE" ]]; then
  echo "Could not locate pulled Production env file under $PULL_DIR" >&2
  exit 1
fi

# Copy only GSC_* lines (no echo of values).
python3 - "$ENV_FILE" "$TMP_ENV" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
wanted = {"GSC_CLIENT_EMAIL", "GSC_PRIVATE_KEY", "GSC_SITE_URL"}
found = set()
out = []
for line in open(src, "r", encoding="utf-8"):
    m = re.match(r"^([A-Z0-9_]+)=", line)
    if not m:
        continue
    key = m.group(1)
    if key in wanted:
        out.append(line if line.endswith("\n") else line + "\n")
        found.add(key)
missing = wanted - found
if missing:
    raise SystemExit(f"Missing keys in Production env pull: {sorted(missing)}")
open(dst, "w", encoding="utf-8").writelines(out)
print("[info] extracted GSC_* keys:", ",".join(sorted(found)))
PY

# Confirm site URL without printing other secrets.
python3 - "$TMP_ENV" <<'PY'
import re, sys
site = None
email_set = False
key_set = False
for line in open(sys.argv[1], encoding="utf-8"):
    if line.startswith("GSC_SITE_URL="):
        site = line.split("=",1)[1].strip().strip('"').strip("'")
    elif line.startswith("GSC_CLIENT_EMAIL=") and line.split("=",1)[1].strip():
        email_set = True
    elif line.startswith("GSC_PRIVATE_KEY=") and line.split("=",1)[1].strip():
        key_set = True
allowed = {
  "sc-domain:shalean.co.za",
  "https://shalean.co.za",
  "https://shalean.co.za/",
  "http://shalean.co.za",
  "http://shalean.co.za/",
}
if site not in allowed and site.rstrip("/") not in {"https://shalean.co.za", "http://shalean.co.za", "sc-domain:shalean.co.za"}:
    raise SystemExit(f"Refusing GSC_SITE_URL={site!r}; expected authorised shalean.co.za property")
if not email_set or not key_set:
    raise SystemExit("GSC_CLIENT_EMAIL or GSC_PRIVATE_KEY missing after pull")
print("[info] GSC_SITE_URL authorised:", site)
print("[info] service account email present:", email_set, "(value not printed)")
PY

echo "[info] Running npm run gsc:seo-fix-001-002-validate (mode=$MODE)…"
set -a
# shellcheck disable=SC1090
source "$TMP_ENV"
set +a
npm run gsc:seo-fix-001-002-validate -- --confirm="$CONFIRM_PHRASE" --mode="$MODE"
