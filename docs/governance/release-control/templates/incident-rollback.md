# Incident / Instant Rollback template

| Field | Value |
|-------|-------|
| Incident ID | |
| Severity | SEV-1 / SEV-2 / SEV-3 |
| Incident Commander | |
| Detected at (Africa/Johannesburg) | |
| Customer impact | |
| Rollback Decision | YES / NO |
| Target deployment ID | |
| Executor (team-scoped) | |
| Verifier | |

## Before

| Item | Value |
|------|-------|
| `shalean.co.za` deployment ID | |
| SHA | |

## After Instant Rollback

| Item | Value |
|------|-------|
| `shalean.co.za` deployment ID | |
| `www.shalean.co.za` deployment ID | |
| SHA | |
| Always smoke | PASS / FAIL |

## DB assessment

| Question | Answer |
|----------|--------|
| Was production DB migrated? | YES / NO / UNKNOWN |
| App↔DB divergence risk? | |
| Forward-fix vs restore exception? | |

## Follow-up

- [ ] Incident note filed within 24h
- [ ] Risk Register updated
- [ ] Post-incident review scheduled (≤5 business days for SEV-1)
