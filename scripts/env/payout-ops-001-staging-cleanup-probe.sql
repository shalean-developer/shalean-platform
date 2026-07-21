UPDATE public.admin_money_action_proposals
SET status = 'failed',
    review_note = 'PAYOUT-OPS-001 concurrency probe cleanup (no earnings apply)'
WHERE id = 'f23a0d12-9030-4569-b4a6-c48d7150a4c1'
  AND status = 'processing'
RETURNING id, status;
