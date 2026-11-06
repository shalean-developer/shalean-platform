#!/usr/bin/env bash
set -euo pipefail

# DISPOSABLE PostgreSQL 17 CI DATABASE ONLY.
if [[ "${PGDATABASE:-}" != "marketing_isolated_test" ||
      "${PGHOST:-}" != "127.0.0.1" ]]; then
  echo "Refusing to run outside disposable CI database"
  exit 1
fi

# Bound connection and SQL waits even when invoked outside the CI timeout.
export PGCONNECT_TIMEOUT=5
export PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=15000'

MODE="${1:-replay}"
UUID="00000000-0000-4000-8000-000000001080"
DECISION_A=withdrawn
SOURCE_A=signed_one_click
EXPLICIT_A=false
EXPECTED_A=new
EXPECTED_B=replay_completed
EXPECTED_COUNT=1
if [[ "$MODE" == grant-race ]]; then
  UUID="00000000-0000-4000-8000-000000001081"
  DECISION_A=granted
  SOURCE_A=authenticated_preferences
  EXPLICIT_A=true
  EXPECTED_A=retry_required
  EXPECTED_B=superseded
  EXPECTED_COUNT=0
elif [[ "$MODE" != replay ]]; then
  echo "Unknown test case"; exit 1
fi
EMAIL="concurrent-1080@example.test"
TMP="$(mktemp -d)"
A_PID=""
B_PID=""

cleanup() {
  touch "$TMP/release-a" 2>/dev/null || true
  for pid in "$A_PID" "$B_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  rm -rf "$TMP"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.user_profiles(id,role,billing_email)
VALUES ('$UUID','customer','$EMAIL');
SQL

# Session A: record consent but delay commit.
PGAPPNAME=marketing_replay_session_a \
psql -X -v ON_ERROR_STOP=1 >"$TMP/a.log" 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT outcome
FROM public.marketing_record_consent_decision_atomic(
  '$UUID','$EMAIL','$DECISION_A','$SOURCE_A',
  'marketing-email-2026-11-v1','concurrent-token-1080',$EXPLICIT_A,0
);
\! touch "$TMP/a-ready"
\! while [ ! -f "$TMP/release-a" ]; do sleep 0.1; done
COMMIT;
SQL
A_PID=$!

for i in $(seq 1 50); do
  [[ -f "$TMP/a-ready" ]] && break
  kill -0 "$A_PID" 2>/dev/null || break
  sleep 0.1
done

if [[ ! -f "$TMP/a-ready" ]]; then
  cat "$TMP/a.log"
  echo "Session A did not acquire its transaction lock"
  exit 1
fi

# Session B: replay the same signed withdrawal.
PGAPPNAME=marketing_replay_session_b \
psql -X -v ON_ERROR_STOP=1 >"$TMP/b.log" 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT outcome
FROM public.marketing_record_consent_decision_atomic(
  '$UUID','$EMAIL','withdrawn','signed_one_click',
  'marketing-email-2026-11-v1','concurrent-token-1080',false,0
);
COMMIT;
SQL
B_PID=$!

# Observe an actual PostgreSQL lock wait, not a fixed sleep.
WAITING="0"

for i in $(seq 1 100); do
  if ! kill -0 "$B_PID" 2>/dev/null; then
    cat "$TMP/b.log"
    echo "Session B exited before the expected lock wait"
    exit 1
  fi

  WAITING="$(psql -X -At -v ON_ERROR_STOP=1 -c "
    SELECT count(*) FROM pg_stat_activity b
    WHERE b.application_name='marketing_replay_session_b'
      AND b.wait_event_type='Lock'
      AND EXISTS (
        SELECT 1 FROM pg_stat_activity a
        WHERE a.application_name='marketing_replay_session_a'
          AND a.pid = ANY(pg_blocking_pids(b.pid))
      );
  ")"

  if [[ "$WAITING" == "1" ]]; then
    break
  fi

  sleep 0.1
done

if [[ "$WAITING" != "1" ]]; then
  cat "$TMP/a.log" "$TMP/b.log"
  echo "Session B never entered the expected lock wait"
  exit 1
fi

echo "PASS: Session B observed waiting on PostgreSQL lock"

# Only release Session A after confirming the lock wait.
touch "$TMP/release-a"

wait "$A_PID"
A_PID=""
wait "$B_PID"
B_PID=""

COUNT="$(psql -X -At -c "
SELECT count(*) FROM public.marketing_email_consent_events
WHERE customer_id='$UUID'
AND source='signed_one_click';
")"

if [[ "$COUNT" != "$EXPECTED_COUNT" ]]; then
  echo "Duplicate consent evidence detected: $COUNT"
  exit 1
fi

grep -Eq "^[[:space:]]*${EXPECTED_A}[[:space:]]*$" "$TMP/a.log"
grep -Eq "^[[:space:]]*${EXPECTED_B}[[:space:]]*$" "$TMP/b.log"

echo "PASS: concurrent signed unsubscribe serialized"
echo "PASS: duplicate consent evidence prevented"

if [[ "$MODE" == grant-race ]]; then
  SNAPSHOT="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT marketing_consent_generation::text || ':' || (marketing_emails_unsubscribed_at IS NULL)::text FROM public.user_profiles WHERE id='$UUID'")"
  [[ "$SNAPSHOT" == "1:true" ]] || { echo "Stale token changed newer grant: $SNAPSHOT"; exit 1; }
  echo "PASS: concurrent newer grant rejects previously unused stale token without withdrawal writes"
else
  bash "$0" grant-race
fi
