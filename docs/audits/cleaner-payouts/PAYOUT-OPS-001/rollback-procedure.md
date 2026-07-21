# PAYOUT-OPS-001 — Rollback procedure

## UI-only rollback (fast)

1. Revert Approvals nav entry and `/office/payouts/approvals` page.
2. Keep APIs if needed for ops; or revert API routes.
3. Leave `PAYOUT_MAKER_CHECKER=true`.

## Full code rollback

1. Revert commit on branch / close PR #78 without merge.
2. Redeploy prior Preview.

## Database

- Do **not** drop claim RPCs or unique index in production without a replacement control.
- On Preview/staging only: if needed, expire open `processing` rows manually with an ops note.

## Never

- Do not set `PAYOUT_MAKER_CHECKER=false` as rollback.
- Do not enable `PAYOUT_ALLOW_SELF_APPROVE` as workaround.
