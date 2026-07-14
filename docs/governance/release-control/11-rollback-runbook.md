# 11 — Rollback Runbook

**Status:** Active design runbook  
**Primary owner:** Release Manager (Incident Commander during incidents)  
**Executor:** Named operator with `shalean-cleaning-services` Vercel access  
**Verifier:** Operations Owner

---

## 1. When to roll back

Trigger Rollback Decision on:

- Production smoke always-check failure  
- Payment / booking error spike  
- Domain pointing at wrong SHA  
- Suspected wrong env linkage  
- Migration verification mismatch with app already promoted  

---

## 2. Decision

| Field | Value |
|-------|-------|
| Incident Commander | |
| Rollback Decision | YES / NO |
| Target deployment ID | |
| Reason | |
| Time (Africa/Johannesburg) | |

Prefer **Instant Rollback** (alias move to prior READY production deploy) over rebuild.

---

## 3. App Instant Rollback procedure

### Preconditions

1. Operator logged into correct Vercel team (`shalean-cleaning-services`)  
2. Target deploy is READY and is a rollback candidate / known-good  
3. Recorder ready to capture before/after deployment IDs  

### Execute

**Dashboard:** Project → Deployments → select known-good → Instant Rollback / Promote  

**CLI (team-scoped example):**

```bash
vercel rollback dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi -S shalean-cleaning-services -y
```

Replace the deployment ID with the approved known-good for the incident.

### Verify (mandatory)

| Check | Pass criteria |
|-------|---------------|
| `get_deployment(shalean.co.za)` / Dashboard domains | Expected `dpl_…` |
| `www.shalean.co.za` | Same expected deploy |
| Deployment SHA | Matches known-good SHA |
| Always smoke matrix | PASS or document residual |

**Do not** declare success without hostname verification. This failed once during the R1 emergency response.

---

## 4. Current known-good (as of 2026-07-14 audit)

| Item | Value |
|------|-------|
| Deployment | `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` |
| SHA | `45ccd98f28c892d4598a253e1386f7dfec84f1e5` |
| Message | `docs(database): add H01 and H02 governance package` |

Keep until a newer promote is intentionally verified and supersedes this ID in the release pack.

Bad auto-promote (do not re-alias without new GO):

| Item | Value |
|------|-------|
| Deployment | `dpl_6TkwPn5Vkiwx9AnazJHXTnthvynu` |
| SHA | `6201e0d27c1d20d7562fb99b44907062f35efc0c` |

---

## 5. Database considerations

| Situation | Action |
|-----------|--------|
| App rolled back; DB never migrated | Safe common case (R1) |
| App rolled back; DB migrated forward | Assess compatibility; may keep DB forward if reverse-compatible; else follow Migration Standard stop plan |
| Migrate failed mid-way | Stop; Database Owner owns recovery; do not promote |
| Restore from physical backup contemplated | Dual-approved recovery exception only; not equivalent to PITR |

---

## 6. Access failure modes (learned)

| Failure | Mitigation |
|---------|------------|
| CLI authenticated to personal team | Pre-check `vercel whoami` / team scope before change window |
| Agent MCP cannot mutate aliases | Human operator required for Instant Rollback |
| False completion claims | Hostname proof checklist non-negotiable |

---

## 7. Post-rollback

1. Incident note: what, when, who, before/after `dpl_…`, verify proof  
2. Update Risk Register if control failed  
3. Eng Owner opens fix branch; re-enter full release workflow  
4. Do **not** “fix” by force-pushing `main` without RC + approvals  

---

## 8. Ownership summary

| Task | Owner |
|------|-------|
| Rollback Decision | Release Manager / Incident Commander |
| Execute Instant Rollback | Named Vercel team operator |
| Verify domains + smoke | Operations Owner |
| DB divergence assessment | Database Owner |
| Customer communication | Business Owner (SEV-1) |
