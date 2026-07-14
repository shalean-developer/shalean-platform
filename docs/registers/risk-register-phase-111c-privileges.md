# Risk Register additions — Phase 1.11C privileges

| Risk ID | Severity | Likelihood | Impact | Status | Mitigation |
|---------|----------|------------|--------|--------|------------|
| RISK-DB-009 | High | High (pre-1.11C) | Catastrophic if RLS fails + TRUNCATE | Mitigated by prepared migrations | Apply 1.11C after approval |
| RISK-DB-010 | Medium | Low | App 42501 on missed table | Open until staging soak | Compatibility checklist; spot GRANT restore |
| RISK-DB-011 | Low | Medium | Silent missing grants on new tables | Open | Document in migration governance; CI note |
