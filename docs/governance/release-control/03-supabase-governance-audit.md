# 03 — Supabase Governance Audit

| Field | Value |
|-------|-------|
| **Production project** | `shalean-platform` (`tchayecuvzssixyxlvfu`, `eu-west-3`) |
| **Staging branch ref** | `gfvdiczqyrvlmynvgegd` (parent = production) |
| **Development branch ref** | `hborcpvarvgynjsjnfei` |
| **Rejected sibling project** | `qpqngtrhbmtctnklejrb` (`shalean project`) — do not use for Shalean prod releases |
| **Audit date** | 2026-07-14 |
| **Mutation** | Read-only SQL / list APIs only |

---

## 1. Environment separation

| Environment | Ref | Role |
|-------------|-----|------|
| Production | `tchaye…` | Customer data plane |
| Staging (Supabase branch) | `gfvdic…` | Pre-production schema soak |
| Development (Supabase branch) | `hborcp…` | Dev experiments |
| Local CLI current link | `.temp/project-ref` → `tchaye…` | **Danger:** local may be linked to production |

Branch statuses observed via API: staging/main branches report `MIGRATIONS_FAILED` at branch metadata level even when schema/history is usable — treat Dashboard “branch health” as advisory; always verify with `schema_migrations` + object SQL.

---

## 2. Migration workflow (current)

### Source of truth

- Active Git directory: `supabase/migrations`
- Filename policy: `^\d{14}_[a-z0-9_]+\.sql$` (`docs/database-baseline/migration-governance.md`)
- CI validator: `.github/workflows/migration-governance.yml`

### Active Git migrations (repository)

```text
20260714010000_production_baseline.sql
20260714120000 … 20260714130200  (Phase 1.11 A/B/C — eight files)
20260714140000_bookings_r0_paid_amount_constraint.sql
```

### Production remote history (verified)

Archaeology stamps only:

```text
20260421 … 20261071  (12 versions)
```

Absent on production: baseline `20260714010000`, Phase 1.11, R1 `20260714140000`.

### Staging remote history (verified, post R1.1A)

Matches active Git stamps through:

```text
20260714010000 … 20260714140000
```

---

## 3. Why DB governance failed the release story (R1)

| What worked | What failed |
|-------------|-------------|
| Production **was not** automatically migrated | App **was** auto-promoted without migration |
| Staging validated R1 schema | Staging initially used MCP `apply_migration` → non-Git stamp (`20260714162631`) |
| R1.1A repaired staging metadata to Git stamp | Process still allows unsafe apply paths |

**Incident pattern:** App deploy and DB migrate are decoupled, but there was **no promote gate** requiring migrate-first when schema is required.

---

## 4. Migration approval (required gate)

### Production Migration Gate (mandatory)

Production schema changes require **Migration Approval** independent of Deployment Approval:

| Field | Requirement |
|-------|-------------|
| Exact Git versions | Listed; no `--include-all` fishing |
| Target project ref | Proven (`tchaye…` only for production) |
| Tooling | Supabase CLI with Git stamps |
| Forbidden | Dashboard DDL; MCP `apply_migration` for governed releases |
| Preconditions | Staging history aligned; validation SQL written |
| Rollback / stop | Documented before first write |
| Approvers | Database Owner **and** Release Manager |

### Staging Migration Gate

| Rule | Detail |
|------|--------|
| Apply via CLI Git stamps | Yes |
| MCP apply | Forbidden for release-track work |
| History repair | `migration repair` metadata-only when schema already correct |
| Verify | Local & Remote versions match for each Git file |

---

## 5. Validation process (required)

Before Migration Approval = GO:

1. `npm run db:migrations:validate`
2. Staging `schema_migrations` contains exact versions
3. Object-level SQL proves intended DDL (constraints, RPCs, grants)
4. App smoke against **staging-bound** deployment + staging DB
5. Dry-run plan for production showing **exactly** the intended pending set

After production migrate:

1. Re-read `schema_migrations`
2. Re-run object verification SQL
3. Only then allow Deployment Approval for schema-dependent releases

---

## 6. PITR / rollback readiness

| Item | State | Implication |
|------|-------|-------------|
| PITR | **Disabled** (`pitr_enabled: false`) | No arbitrary point-in-time restore |
| Physical backups (WAL-G) | Present / completed (H02B evidence) | Last-resort; dual-approved exception only |
| Automatic down migrations | **Not assumed** | Prefer app Instant Rollback first |
| Forward-fix | Preferred for privilege mistakes | Documented in H02B |

Production migration standard must assume **no PITR** unless infrastructure decision changes. See H02B backup inspection and change-control exception model.

---

## 7. Migration ownership

| Responsibility | Role |
|----------------|------|
| Author migration in Git | Engineering Owner |
| Filename / governance compliance | Engineering Owner + CI |
| Staging apply + verify | Database Owner |
| Production Migration Approval | Database Owner + Release Manager |
| Production apply execution | Database Owner (or delegated CLI operator under approval) |
| Wrong-target prevention | Database Owner — identity re-proof every time |
| History repair authority | Database Owner only |

---

## 8. Design conclusions

| Decision | Rule |
|----------|------|
| Required production migration gate | Dual-approved Migration Approval before any production DDL / history mutation |
| Required validation | Staging aligned + object SQL + dry-run pending set |
| Required approval | Database Owner + Release Manager |
| Required rollback preparation | Named Instant Rollback deploy ID; migration stop conditions; backup exception if restore contemplated |
| MCP / Dashboard | Never the production release path |

See [07-production-migration-standard.md](./07-production-migration-standard.md).
