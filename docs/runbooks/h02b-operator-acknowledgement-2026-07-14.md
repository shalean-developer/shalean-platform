# H02B Operator Acknowledgement

**Status:** PENDING — operators named; acknowledgements not signed  
**Updated:** 2026-07-14T16:50:00+02:00 (Africa/Johannesburg)  
**Approved repository SHA:** `99526d72fca841fdc189eaf33720655a564675b0` on `main`  
**Production identity:** `shalean-platform` / `tchaye****xlvfu` / `eu-west-3`

```text
ACKNOWLEDGEMENT TEMPLATE — NOT PROOF OF ACKNOWLEDGEMENT UNTIL SIGNED
```

## Required acknowledgements (each named operator)

Each assigned operator must explicitly acknowledge:

1. Correct project identity (`shalean-platform` / `tchaye****xlvfu` / `eu-west-3`; rejected `qpqn****ejrb` excluded).
2. Correct repository SHA (`99526d72fca841fdc189eaf33720655a564675b0` on `main`, or later dual-approved docs-only SHA).
3. Model B sequence only (revert 12 archaeology versions → mark baseline applied without SQL → dry-run = eight Phase 1.11 → single gated push).
4. Baseline is history-only for this change.
5. Baseline SQL must **not** execute against production.
6. `--include-all` is prohibited.
7. Only the eight approved Phase 1.11 migrations may be pushed.
8. Any dry-run mismatch is a stop.
9. Any unexpected migration version is a stop.
10. No improvisation; no unrelated SQL.
11. Do not continue after a failed verification.
12. Recovery authority and when to escalate (recovery owner: Farai Chitekedza; escalation method still PENDING).
13. Communications responsibilities (communications owner: Farai Chitekedza).
14. **PITR is unavailable** on production (`pitr_enabled: false`) by current infrastructure/cost decision.
15. **Recovery is backup-only** under a formal recovery exception — not point-in-time recovery.
16. **Physical backups are not equivalent to PITR**; they do not provide arbitrary second-level restore.
17. A restore may **lose changes made after the selected backup**.
18. **No execution may proceed** without a dual-approved backup-only recovery exception and a named recovery authority.

## Acknowledgement log

| Operator | Role | Acknowledged | Timestamp | Evidence |
| -------- | ---- | ------------ | --------- | -------- |
| Princess Saidi | Execution operator | PENDING | PENDING | PENDING |
| Beaulla Chemugarira | Verification operator | PENDING | PENDING | PENDING |
| Farai Chitekedza | Recovery owner | PENDING | PENDING | PENDING |
| Farai Chitekedza | Communications owner | PENDING | PENDING | PENDING |
| Farai Chitekedza | Business validation owner | PENDING | PENDING | PENDING |

Acknowledgement Status and Timestamp remain PENDING until explicit evidence is supplied by the operator (written approval in ticket, signed form, or equivalent durable record). Assignment without acknowledgement does not pass OPS-06.

## Companions

- `docs/runbooks/h02b-production-change-control-2026-07-14.md`
- `docs/runbooks/h02b-production-security-remediation-runbook-2026-07-14.md`
- `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md`
