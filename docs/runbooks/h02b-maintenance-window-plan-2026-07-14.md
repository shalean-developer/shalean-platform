# H02B Maintenance Window Plan

**Status:** PENDING — window not scheduled or approved  
**Timezone:** Africa/Johannesburg  
**Updated:** 2026-07-14T16:50:00+02:00 (Africa/Johannesburg)  
**Change ID:** `PENDING-CHANGE-ID`

```text
PLANNING DOCUMENT ONLY — DOES NOT AUTHORIZE EXECUTION
NO MUTATION COMMANDS ARE INCLUDED
```

## Window

| Field | Value |
|-------|-------|
| Date | PENDING |
| Start time | PENDING |
| End time | PENDING |
| Timezone | Africa/Johannesburg |
| Expected duration | PENDING |
| Expected maximum change duration | PENDING |
| Change freeze start | PENDING |
| Change freeze end | PENDING |
| Customer impact | PENDING |
| Internal impact | PENDING |
| Business impact statement | PENDING |
| Window approved by | PENDING |
| Notification completed | PENDING |
| Communications owner | Farai Chitekedza |

Do not select a date or time until an operator explicitly supplies and approves them.

## Recovery posture for this window (backup-only exception)

PITR is **disabled** by current infrastructure/cost decision. Recovery for this change, if authorized, is under a formal **backup-only recovery exception** (see change-control record). Physical backups are **not** equivalent to PITR.

| Field | Value |
|-------|-------|
| Backup age at window start | PENDING (reconfirm latest physical backup ID/timestamp at T-10) |
| Latest verified backup (package time) | ID `1108905187` at `2026-07-14T00:37:50.739Z` (`2026-07-14T02:37:50+02:00`) |
| Accepted RPO | PENDING |
| Accepted RTO | PENDING |
| Recovery decision deadline | PENDING |
| Rollback authority | PENDING |
| Restore escalation path | PENDING |
| Named recovery owner | Farai Chitekedza |

## Preconditions Before Window Opens

- [ ] All TECH-* gates still PASS
- [ ] Linked project remains `shalean-platform` / `tchaye****xlvfu` / `eu-west-3`
- [ ] Repository on approved SHA `99526d72fca841fdc189eaf33720655a564675b0` (or later dual-approved docs-only SHA)
- [ ] Backup-only recovery exception dual-approved (REC-01E) **or** PITR enabled with fresh evidence (current: PITR off; exception PENDING)
- [ ] Accepted RPO/RTO documented and approved (REC-01F)
- [ ] Recovery owner and restore escalation path assigned (recovery owner: Farai Chitekedza; escalation path still PENDING)
- [ ] Approver 1 and Approver 2 available and signed
- [ ] Execution, verification, recovery, communications, and business-validation operators present
- [ ] No active production incident
- [ ] No overlapping database change
- [ ] Support and operations notified
- [ ] Smoke fixtures / accounts confirmed
- [ ] Verification SQL packs loaded and readable
- [ ] Change freeze start/end acknowledged
- [ ] Freeze and communications owners named

## Window Timeline

| Relative Time | Activity |
|---------------|----------|
| T-30 min | Attendance, identity, incident and freeze checks |
| T-20 min | Repository and project verification |
| T-15 min | Migration-history re-list |
| T-10 min | Recovery reconfirmation (backup age, exception status, RPO/RTO) |
| T-5 min | Final verbal/written GO decision |
| T0 | Begin approved H02B execution (only if Decision = GO) |
| T+ | H02C verification |
| T+ | Application smoke tests |
| T+ | Close or enter recovery process |

Mutation command details remain exclusively in the production runbook and must not be copied here until GO.

## Communication Plan

| Item | Value |
|------|-------|
| Internal notification audience | PENDING |
| Maintenance-start message | PENDING |
| Success message | PENDING |
| Delay message | PENDING |
| Rollback / recovery message | PENDING |
| Incident escalation method | PENDING |
| Communications owner | Farai Chitekedza |

## Change Freeze

During the approved window, confirm all of the following:

- [ ] No other database migration
- [ ] No production application deployment
- [ ] No environment-variable change
- [ ] No manual SQL outside the approved H02B package
- [ ] No Supabase branch create / merge / reset / rebase
- [ ] No unrelated maintenance

| Freeze field | Value |
|--------------|-------|
| Freeze start | PENDING |
| Freeze end | PENDING |
| Freeze confirmed by | PENDING |
| Freeze confirmation timestamp | PENDING |
| Evidence | PENDING |

## Companions

- `docs/runbooks/h02b-production-change-control-2026-07-14.md`
- `docs/runbooks/h02b-go-no-go-checklist-2026-07-14.md`
- `docs/runbooks/h02b-production-security-remediation-runbook-2026-07-14.md`
