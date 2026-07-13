# Risk Register (booking payment settlement — Phase A)

| Risk ID | Finding | Likelihood | Impact | Mitigation | Status |
|---------|---------|------------|--------|------------|--------|
| RISK-BOOK-001 | False paid signals from pending cash | Medium→Low | High | Confirm writes zero cash; settlement helper | Mitigated in code |
| RISK-BOOK-002 | R0 settle vs constraint / silent failure | Medium→Low | High | Migration + RPC + error propagation | Mitigated in code |
| RISK-BOOK-003 | Admin equipment cash overwrite | Medium→Low | Critical | Paid-safe equipment helper | Mitigated in code |
| RISK-BOOK-004 | Credit pre-spend (BK-004) | Medium | High | Deferred to Phase B | **Open** |
| RISK-DATA-001 | Incorrect data correction of legitimate cash | Low | High | Dry-run script + exclusion gates | Open until reviewed apply |

Update after staging verification and production dry-run.
