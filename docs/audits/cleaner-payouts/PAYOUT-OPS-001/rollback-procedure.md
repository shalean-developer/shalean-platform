# PAYOUT-OPS-001 — Rollback procedure

## UI-only rollback (fast)

1. Revert Approvals nav entry and `/office/payouts/approvals` page.
2. Keep APIs if needed for ops; or revert API routes.
3. Leave `PAYOUT_MAKER_CHECKER=true`.

## Full code rollback

1. Revert commit on branch / close PR #78 without merge.
2. Redeploy prior Preview.

## Database (production)

- Do **not** drop claim/reject RPCs or unique indexes without a replacement control.
- Forward-only: if a hotfix is required, ship a new migration; do not rewrite applied production migrations.
- On Preview/staging only: if needed, expire open `processing` rows manually with an ops note.

## Production post-merge rollback

1. Revert the merge commit on `main` (or ship a revert PR) and redeploy production.
2. Leave production DB RPCs/indexes in place unless a forward migration replaces them — orphaned RPCs are safer than removing concurrency guards while maker–checker remains on.
3. Optionally hide Approvals UI immediately while APIs remain (ops can still use API).

## Never

- Do not set `PAYOUT_MAKER_CHECKER=false` as rollback.
- Do not enable `PAYOUT_ALLOW_SELF_APPROVE` as workaround.
