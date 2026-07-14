# Technical Debt Register — Phase 1.11C privileges

| Debt ID | Description | Priority | Status |
|---------|-------------|----------|--------|
| DEBT-DB-004 | Least-privilege table GRANTs vs baseline GRANT ALL | P1 | **Partially resolved** by 1.11C migrations (service-only revoke + strip + defaults) |
| DEBT-DB-013 | Align each authenticated/anon GRANT verb with exact RLS policy verbs | P2 | Open |
| DEBT-DB-014 | Audit remaining INVOKER function EXECUTE grants for client roles | P2 | Open (WhatsApp helpers included in 1.11C) |
| F-GOV-001 | Formal SEOS privilege / security standards docs | P2 | Open |
