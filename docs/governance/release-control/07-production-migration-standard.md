# 07 — Production Migration Standard

**Status:** Active design standard  
**Scope:** Any production Supabase schema or `schema_migrations` mutation for Shalean

---

## 1. Principle

Database change is an independent gated release track.  
**Migration Approval ≠ Deployment Approval.**

App promotion that depends on new schema is **NO-GO** until migration verification passes.

---

## 2. When Migration Approval is required

Required for:

- New files under `supabase/migrations` applied to production  
- `migration repair` on staging or production  
- Manual SQL on shared environments  
- Privilege / policy / function / constraint changes  

Not required for:

- Pure frontend/docs changes with no schema dependency (Deployment Approval still required for promote)

---

## 3. Allowed tooling

| Allowed | Forbidden for governed releases |
|---------|----------------------------------|
| Supabase CLI with Git filename stamps | MCP `apply_migration` |
| Exact version apply / dry-run lists | Dashboard table UI / ad-hoc DDL |
| Metadata-only `migration repair` when SQL already correct | Re-running SQL to heal stamps |
| Change-control packet (H02B style for high risk) | `--include-all` speculative push |

---

## 4. Staging-first rules

1. Apply on staging with Git stamps.  
2. Confirm `schema_migrations` Local/Remote alignment.  
3. Object-verify DDL.  
4. Smoke staging app against staging DB.  
5. Only then draft production Migration Approval.

---

## 5. Production Migration Approval packet

| Field | Required |
|-------|----------|
| Change ID | Yes |
| Exact versions to apply / repair | Yes |
| Target project ref (`tchaye…`) | Yes + identity re-proof |
| Evidence SQL will / will not re-run | Yes |
| Dry-run expected pending set | Yes |
| Verification SQL | Yes |
| Stop / rollback conditions | Yes |
| PITR/backup awareness | Yes (PITR currently off — document exception) |
| Approvers | Database Owner + Release Manager |
| Timestamps | Yes |

---

## 6. Execution order

```text
1. Freeze improvisation — only approved versions
2. Identity proof: linked ref == production
3. Dry-run matches approval packet
4. Apply exactly those versions
5. Verification SQL PASS
6. Record versions in release evidence
7. Hand off to Deployment Approval (if app promote needed)
```

---

## 7. Rollback preparation (DB)

| Preference | Action |
|------------|--------|
| 1 | Do not promote app if migrate fails |
| 2 | If app already promoted: Instant Rollback app first |
| 3 | Forward-fix privilege mistakes when safe |
| 4 | Physical backup restore only under dual-approved recovery exception |

**Do not** claim PITR capability while `pitr_enabled: false`.

---

## 8. Ownership

| Step | Owner |
|------|-------|
| Draft packet | Database Owner |
| Approve | Database Owner + Release Manager |
| Execute | Database Owner (or delegated operator under live approval) |
| Verify | Database Owner + Operations Owner (smoke overlap) |

---

## 9. Compatibility

- Extends `docs/database-baseline/migration-governance.md`  
- Aligns with H02B change-control spirit for high-risk DB work  
- R1 production release must migrate `20260714140000` **before** promoting R1 app  
