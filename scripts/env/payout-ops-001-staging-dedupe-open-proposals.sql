-- PAYOUT-OPS-001 staging prep: expire older duplicate open proposals
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY booking_id, action_type, COALESCE(payload->>'cleaner_id', '')
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.admin_money_action_proposals
  WHERE status IN ('pending', 'processing')
)
UPDATE public.admin_money_action_proposals p
SET status = 'expired',
    review_note = COALESCE(p.review_note, 'PAYOUT-OPS-001 staging: expired duplicate open proposal before unique index')
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;
