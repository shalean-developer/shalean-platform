# Deployment approval template

**Authorizes** explicit production promote / domain assignment only after Go and (if required) migration verification.

| Field | Value |
|-------|-------|
| Change ID | |
| Git SHA | |
| RC deployment ID / URL | |
| Migration status | Done / N/A / Blocked |
| Go result | GO / GO WITH CONSTRAINTS |
| Instant Rollback deployment ID | |
| Operator (team-scoped) | |
| Release Manager approval | |
| Timestamp (Africa/Johannesburg) | |

## Preconditions confirmed

- [ ] RC READY at approved SHA
- [ ] Staging smoke PASS
- [ ] Migration verified if schema required
- [ ] Domains currently on known-good (record ID): 
- [ ] Monitoring owner standing by

## Execute (after signature)

```bash
vercel promote <rc-deployment-id-or-url> -S shalean-cleaning-services --yes
```

## Post-promote verification

| Check | Result |
|-------|--------|
| `shalean.co.za` → expected `dpl_…` | |
| `www.shalean.co.za` → same | |
| Deployment SHA == approved SHA | |
| Production smoke always-matrix | |
