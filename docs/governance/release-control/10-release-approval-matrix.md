# 10 — Release Approval Matrix

---

## 1. Approval matrix

| Action | Engineering Owner | Database Owner | Operations Owner | Release Manager | Business Owner |
|--------|-------------------|----------------|------------------|-----------------|----------------|
| Merge PR to `main` | Review | Review if migrations | — | May set freeze policy | — |
| Declare RC ready | **Approve** | Consult if DB | Consult | Record | — |
| Staging migrate | Support | **Approve + execute** | Verify smoke after | Informed | — |
| Staging smoke sign-off | Support | Support | **Approve** | Informed | — |
| Go / No-Go | Recommend | Recommend (if DB) | Recommend | **Decide** | Consult / co-sign for high impact |
| Production migrate | Support | **Approve + execute** | Standby | **Co-approve** | Informed |
| Production promote | Support | Block if migrate incomplete | Standby | **Approve + authorize** | Informed |
| Instant Rollback | Support | Assess DB divergence | Detect / verify | **Decide** | Informed |
| Emergency release exception | Recommend | Recommend | Recommend | **Approve** + post-mortem | Co-approve if revenue impact |

---

## 2. Dual-control requirements

| Change class | Minimum approvers |
|--------------|-------------------|
| App-only promote (no schema) | Release Manager |
| Schema + app | Database Owner **and** Release Manager (migrate); Release Manager (promote) |
| High-risk DB history / security (H02B-class) | Dual approval per change-control + backup exception rules |
| Emergency hotfix | Release Manager + on-call Engineering; Database Owner if schema |

---

## 3. Emergency Release Standard

Use only when delay creates material customer or safety harm.

### Allowed

- Accelerated review (still recorded)  
- Temporary constraint window  
- Promote of minimal SHA  

### Still required

- Named Incident Commander (= Release Manager unless delegated in writing)  
- Pre-staged Instant Rollback target  
- Team-scoped Vercel access verified **before** merge/promote  
- Migration rule unchanged: schema-dependent app cannot ship without migrate verify  
- Full evidence pack within 24 hours  
- Post-incident review within 5 business days  

### Still forbidden

- Unverified “rollback complete” claims  
- MCP production DDL  
- Silent dashboard schema edits  

---

## 4. Incident Escalation Matrix

| Severity | Examples | Immediate owner | Escalate to | Customer comms |
|----------|----------|-----------------|-------------|----------------|
| SEV-1 | Site down; payments failing; wrong domains; data corruption risk | Operations Owner + Release Manager | Business Owner within 15 min | Business Owner |
| SEV-2 | Major feature broken; elevated error rate | Operations Owner | Release Manager within 30 min | As needed |
| SEV-3 | Minor regression; non-critical admin issue | Engineering Owner | Release Manager next business day | Optional |
| Process SEV | Merge auto-promoted unexpectedly | Release Manager | Business Owner + Eng Owner | If customer-visible |

### First actions (all SEV-1)

1. Declare incident + Incident Commander  
2. Prefer Instant Rollback to last known-good  
3. Verify hostname → `dpl_…` + SHA  
4. Assess whether DB was migrated  
5. Write incident note with proof  

Current known-good production (until superseded):

| Item | Value |
|------|-------|
| Deployment | `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` |
| SHA | `45ccd98f28c892d4598a253e1386f7dfec84f1e5` |

---

## 5. Role assignment (required before R1.3)

R1.2X platform controls are live with a CONDITIONAL PASS. Named humans remain **required** before controlled production release:

| Role | Name | Backup |
|------|------|--------|
| Release Manager | TBD — assign before R1.3 | TBD |
| Database Owner | TBD — assign before R1.3 | TBD |
| Engineering Owner | TBD — assign before R1.3 | TBD |
| Operations Owner | TBD — assign before R1.3 | TBD |
| Business Owner | TBD — assign before R1.3 | TBD |

Until filled, production promote remains blocked even if technical controls are green.
