-- Concurrent claim probe returning result rows
WITH booking AS (
  SELECT id AS booking_id FROM public.bookings ORDER BY created_at DESC NULLS LAST LIMIT 1
),
ins AS (
  INSERT INTO public.admin_money_action_proposals (
    action_type, booking_id, payload, proposed_by, proposed_by_email, status, expires_at
  )
  SELECT
    'adjust_payout_earnings',
    b.booking_id,
    jsonb_build_object(
      'payout_cents', 12300,
      'bonus_cents', 0,
      'cleaner_id', null,
      'adjustment_note', 'PAYOUT-OPS-001 concurrency fixture',
      'edit_mode', 'solo_owner',
      'original_total_cents', 10000,
      'fixture_key', gen_random_uuid()::text
    ),
    '11111111-1111-4111-8111-111111111199',
    'ops001-proposer@example.com',
    'pending',
    now() + interval '1 hour'
  FROM booking b
  RETURNING id
),
c1 AS (
  SELECT public.claim_admin_money_action_proposal(id, '22222222-2222-4222-8222-222222222299', false) AS claim
  FROM ins
),
c2 AS (
  SELECT public.claim_admin_money_action_proposal(i.id, '33333333-3333-4333-8333-333333333399', false) AS claim
  FROM ins i
),
cleanup AS (
  UPDATE public.admin_money_action_proposals p
  SET status = 'failed',
      review_note = 'PAYOUT-OPS-001 concurrency probe cleanup (no earnings apply)'
  FROM ins
  WHERE p.id = ins.id AND p.status = 'processing'
  RETURNING p.id
)
SELECT
  (SELECT id FROM ins) AS proposal_id,
  (SELECT claim FROM c1) AS first_claim,
  (SELECT claim FROM c2) AS second_claim,
  (SELECT id FROM cleanup) AS cleaned_id;
