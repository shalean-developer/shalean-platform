-- Verify PAYOUT-OPS-001 objects on staging
SELECT
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'claim_admin_money_action_proposal') AS claim_fn,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reject_admin_money_action_proposal') AS reject_fn,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'admin_money_action_proposals_one_open_uidx') AS uniq_idx,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'admin_money_action_proposals_queue_idx') AS queue_idx;
