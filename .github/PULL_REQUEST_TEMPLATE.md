## Summary

<!-- What changed and why (1–3 bullets). -->

-

## Risk class

- [ ] Docs / governance only (no customer traffic impact after controls)
- [ ] App-only (no schema)
- [ ] Schema + app (requires Migration Approval before promote)
- [ ] High-risk DB / security (H02B-class)

## Migrations

- [ ] No migration files changed
- [ ] Migration files added/changed — list exact versions:

```text
# e.g. 20260714140000_bookings_r0_paid_amount_constraint.sql
```

## Release-control reminders

- Merge to `main` ≠ customer release.
- Production domains move only after Deployment Approval + explicit Promote.
- If schema is required: Migration Approval → migrate → verify **before** promote.
- Instant Rollback target ID must be known before any production promote.

## Test plan

- [ ] Required CI green (`vitest`, `validate-migration-filenames`)
- [ ] Staging smoke (if customer-facing)
- [ ] Go / No-Go packet attached / linked (if production promote planned)

## Rollback note

Known-good production deploy (update when superseded): `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` @ `45ccd98f`
