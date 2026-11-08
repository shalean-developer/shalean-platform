#!/usr/bin/env bash
set -euo pipefail
# Disposable local PostgreSQL 17 only. No filesystem waits or orphanable shell loops.
if [[ "${PGDATABASE:-}" != marketing_isolated_test || "${PGHOST:-}" != 127.0.0.1 ]]; then
  echo "Refusing to run outside disposable CI database"; exit 1
fi
export PGCONNECT_TIMEOUT=5
export PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=15000'
MODE="${1:-resume-race}"
UUID="00000000-0000-4000-8000-000000001080"
DECISION=withdrawn; SOURCE=signed_one_click; EXPLICIT=false
EXPECTED_A=new; EXPECTED_B=replay_completed; EXPECTED_COUNT=1; COUNT_SOURCE=signed_one_click
case "$MODE" in
  resume-race) UUID="00000000-0000-4000-8000-000000001110"; EXPECTED_A=true; EXPECTED_B=new; EXPECTED_COUNT=2 ;;
  worker-race) UUID="00000000-0000-4000-8000-000000001111"; EXPECTED_A=claimed; EXPECTED_B=false; EXPECTED_COUNT=1 ;;
  *) echo "Unknown case"; exit 1 ;;
esac
EMAIL="resume-race@example.test"
CALL_A="(SELECT public.marketing_resume_consented_delivery_atomic('$UUID','$EMAIL',2,'second')::text AS outcome) AS resume"
CALL_B="public.marketing_record_consent_decision_atomic('$UUID','$EMAIL','withdrawn','signed_one_click','v1','new-token',false,2)"
if [[ "$MODE" == worker-race ]]; then
  CALL_A="public.synthetic_claim_resume_job('$UUID')"
  CALL_B="(SELECT public.marketing_resume_consented_delivery_atomic('$UUID','$EMAIL',2,'second')::text AS outcome) AS resume"
fi
TMP="$(mktemp -d)"; A_PID=""; B_PID=""
cleanup() {
  for pid in "$A_PID" "$B_PID"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
  rm -rf "$TMP"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE IF NOT EXISTS public.email_suppressions(email text PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.synthetic_claim_resume_job(p_id uuid) RETURNS TABLE(outcome text)
LANGUAGE sql AS \$fn\$
  UPDATE public.marketing_email_reconciliation_jobs SET status='processing',claim_token=gen_random_uuid(),
    lease_expires_at=clock_timestamp()+interval '5 minutes'
    WHERE customer_id=p_id AND status='pending' RETURNING 'claimed'::text;
\$fn\$;
CREATE TABLE IF NOT EXISTS public.marketing_concurrency_signals(case_id uuid PRIMARY KEY,released boolean NOT NULL DEFAULT false);
INSERT INTO public.marketing_concurrency_signals(case_id) VALUES('$UUID');
INSERT INTO public.user_profiles(id,role,billing_email) VALUES('$UUID','customer','$EMAIL');
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT * FROM public.marketing_record_consent_decision_atomic('$UUID','$EMAIL','granted','authenticated_preferences','v1','first',true);
SELECT * FROM public.marketing_record_consent_decision_atomic('$UUID','$EMAIL','withdrawn','signed_one_click','v1','old-token',false,1);
SELECT * FROM public.marketing_record_consent_decision_atomic('$UUID','$EMAIL','granted','authenticated_preferences','v1','second',true);
SQL
PGAPPNAME=marketing_replay_session_a psql -X -v ON_ERROR_STOP=1 >"$TMP/a.log" 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT outcome FROM $CALL_A;
DO \$wait\$
DECLARE deadline timestamptz := clock_timestamp()+interval '18 seconds';
BEGIN
  LOOP
    EXIT WHEN (SELECT released FROM public.marketing_concurrency_signals WHERE case_id='$UUID');
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'Controller never released session A'; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
END;
\$wait\$;
COMMIT;
SQL
A_PID=$!
READY=0
for _ in $(seq 1 50); do
  kill -0 "$A_PID" 2>/dev/null || break
  READY="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='marketing_replay_session_a' AND wait_event='PgSleep'")"
  [[ "$READY" == 1 ]] && break
  sleep 0.05
done
[[ "$READY" == 1 ]] || { cat "$TMP/a.log"; echo "Session A did not hold the transaction"; exit 1; }
PGAPPNAME=marketing_replay_session_b psql -X -v ON_ERROR_STOP=1 >"$TMP/b.log" 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT outcome FROM $CALL_B;
COMMIT;
SQL
B_PID=$!
WAITING=0
for _ in $(seq 1 100); do
  kill -0 "$B_PID" 2>/dev/null || { cat "$TMP/b.log"; echo "Session B exited before locking"; exit 1; }
  WAITING="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_stat_activity b WHERE b.application_name='marketing_replay_session_b' AND b.wait_event_type='Lock' AND EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.application_name='marketing_replay_session_a' AND a.pid=ANY(pg_blocking_pids(b.pid)))")"
  [[ "$WAITING" == 1 ]] && break
  sleep 0.05
done
[[ "$WAITING" == 1 ]] || { cat "$TMP/a.log" "$TMP/b.log"; echo "Expected lock wait was not observed"; exit 1; }
echo "PASS: $MODE session B observed blocked by session A"
psql -X -v ON_ERROR_STOP=1 -c "UPDATE public.marketing_concurrency_signals SET released=true WHERE case_id='$UUID'"
wait "$A_PID"; A_PID=""
wait "$B_PID"; B_PID=""
grep -Eq "^[[:space:]]*${EXPECTED_A}[[:space:]]*$" "$TMP/a.log"
grep -Eq "^[[:space:]]*${EXPECTED_B}[[:space:]]*$" "$TMP/b.log"
COUNT="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.marketing_email_consent_events WHERE customer_id='$UUID' AND source='$COUNT_SOURCE'")"
[[ "$COUNT" == "$EXPECTED_COUNT" ]] || { echo "Wrong evidence count: $COUNT"; exit 1; }
SNAPSHOT="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT marketing_consent_generation::text||':'||(marketing_emails_unsubscribed_at IS NOT NULL)::text||':'||(SELECT status FROM public.marketing_email_reconciliation_jobs WHERE customer_id='$UUID') FROM public.user_profiles WHERE id='$UUID'")"
if [[ "$MODE" == resume-race ]]; then EXPECTED_SNAPSHOT="2:true:pending"; else EXPECTED_SNAPSHOT="2:true:processing"; fi
[[ "$SNAPSHOT" == "$EXPECTED_SNAPSHOT" ]] || { echo "Unsafe race outcome: $SNAPSHOT"; exit 1; }
for _ in $(seq 1 20); do
  ACTIVE="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_stat_activity WHERE application_name IN ('marketing_replay_session_a','marketing_replay_session_b')")"
  [[ "$ACTIVE" == 0 ]] && break
  sleep 0.05
done
[[ "$ACTIVE" == 0 ]] || { echo "Concurrency sessions were not cleaned up"; exit 1; }
echo "PASS: $MODE outcomes, evidence and session cleanup"
if [[ "$MODE" == resume-race ]]; then bash "$0" worker-race; fi
