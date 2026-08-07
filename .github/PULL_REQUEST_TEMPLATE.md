## Summary

<!-- What changed and why (1–3 bullets). -->

-

## Risk class

- [ ] Docs / governance only
- [ ] App-only (no schema)
- [ ] Schema + app
- [ ] High-risk DB / payments / security

## Migrations

- [ ] No migration files changed
- [ ] Migration files added/changed — list exact versions below

```text
# e.g. 20260807190000_example.sql
```

## Validation

- [ ] Required CI is green (`vitest`, `validate-migration-filenames`, and any scoped security checks)
- [ ] Customer-facing changes tested in preview/staging where applicable
- [ ] Payment, booking, auth, RBAC, notification, or migration changes have focused regression coverage
- [ ] No stale migration filenames or superseded implementation files are being reintroduced

## Production release

- [ ] No production release required
- [ ] Production release planned — approved Git SHA identified
- [ ] Migration order documented when schema changes are involved
- [ ] Rollback plan / known-good deployment identified before promotion
- [ ] Production smoke checks defined

## Rollback note

<!-- Describe the rollback action for this change. Do not hard-code an old deployment ID. -->
