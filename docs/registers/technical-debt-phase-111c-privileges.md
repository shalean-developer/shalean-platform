# Technical Debt Register — Phase 1.11C privileges

| Debt ID | Description | Priority | Status |
|---------|-------------|----------|--------|
| DEBT-DB-004 | Least-privilege table GRANTs vs baseline GRANT ALL | P1 | **Partially resolved** by 1.11C migrations (service-only revoke + strip + defaults) |
| DEBT-DB-013 | Align each authenticated/anon GRANT verb with exact RLS policy verbs | P2 | Open |
| DEBT-DB-014 | Audit remaining INVOKER function EXECUTE grants for client roles | P2 | Open (WhatsApp helpers included in 1.11C) |
| DEBT-DB-015 | Enable PITR after production infrastructure upgrade | P2 (Medium) — Infrastructure / Recovery | **Planned** (not scheduled; accepted as follow-on after compute upgrade) |
| F-GOV-001 | Formal SEOS privilege / security standards docs | P2 | Open |

### DEBT-DB-015 completion criteria

1. Upgrade production compute to **Small** or larger (PITR prerequisite).
2. Enable an appropriate paid PITR retention period.
3. Verify `pitr_enabled: true` via read-only `backups list` (or dashboard equivalent) and retain evidence.
4. Update disaster-recovery / H02B recovery documentation to reflect PITR as primary path.
5. Perform a governed restore drill (non-destructive planning + authorized test as approved).

Cross-ref: `H02B-R02`, `H02B-R05`, `docs/audits/evidence/h02b-pitr-backup-inspection-2026-07-14/`.

