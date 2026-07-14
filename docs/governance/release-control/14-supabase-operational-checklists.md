# Supabase production migration operational checklists

**Status:** Active (R1.2X)  
**Schema mutations in this phase:** None  
**Migrations executed:** None  

Operational governance only. Aligns with [07-production-migration-standard.md](./07-production-migration-standard.md) and [03-supabase-governance-audit.md](./03-supabase-governance-audit.md).

---

## 1. Production migration approval process

1. Engineering Owner authors Git migration via `supabase migration new`.
2. Staging apply via **Supabase CLI Git stamps only** (never MCP `apply_migration` for governed releases).
3. Staging history + object SQL + staging smoke PASS.
4. Database Owner drafts Migration Approval packet (`templates/migration-approval.md`).
5. Dual approve: **Database Owner + Release Manager**.
6. Identity re-proof: production ref `tchayecuvzssixyxlvfu` only.
7. Dry-run pending set must match packet exactly (no `--include-all`).
8. Execute → verification SQL → record versions in release evidence.
9. Only then may Deployment Approval proceed for schema-dependent promotes.

---

## 2. Migration execution ownership

| Step | Owner |
|------|-------|
| Author migration | Engineering Owner |
| Filename / CI compliance | Engineering Owner |
| Staging apply + verify | Database Owner |
| Production Migration Approval | Database Owner + Release Manager |
| Production apply | Database Owner (or delegated CLI operator under live approval) |
| Wrong-target prevention | Database Owner — prove ref every time |
| History repair (`migration repair`) | Database Owner only |

**Forbidden executors for production DDL:** Dashboard UI, MCP `apply_migration`, unapproved agents.

---

## 3. PITR verification checklist

| # | Check | How | Pass criteria |
|---|-------|-----|---------------|
| P1 | PITR enabled? | Supabase project settings / advisors | Document true/false |
| P2 | If PITR **off** | Confirm current state | Do **not** claim PITR recovery |
| P3 | Physical backups | WAL-G / Dashboard backups status | Note last backup time |
| P4 | Restore exception path | Written in packet | Dual-approved only; not default |
| P5 | App Instant Rollback ID | Known-good `dpl_…` recorded | Prefer app rollback first |

**Verified as of R1.2 audit:** `pitr_enabled: false` on production. Re-check at T-0 of every production migrate.

---

## 4. Production migration execution checklist

- [ ] Migration Approval dual-signed
- [ ] Operator using CLI (not MCP invent stamps)
- [ ] `npm run db:migrations:validate` PASS
- [ ] Staging `schema_migrations` contains intended versions
- [ ] Linked / targeted ref proven = `tchaye…`
- [ ] Dry-run pending set == approval list
- [ ] Apply **exact** approved versions
- [ ] Re-read `schema_migrations`
- [ ] Object verification SQL PASS
- [ ] Stop if any mismatch — do not promote app
- [ ] File versions into release evidence pack

---

## 5. Rollback preparation checklist (DB + app)

- [ ] Instant Rollback deployment ID named (current known-good: `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi`)
- [ ] Team-scoped Vercel operator available (`shalean-cleaning-services`)
- [ ] Migration stop conditions written (halt on verification fail)
- [ ] Preference order agreed: withhold app promote → Instant Rollback app → forward-fix DB → backup restore exception
- [ ] Business Owner contact reachable for SEV-1
- [ ] PITR state acknowledged (currently off → no arbitrary PITR)

---

## 6. Environment identity card

| Env | Ref | Role |
|-----|-----|------|
| Production | `tchayecuvzssixyxlvfu` | Customer data |
| Staging branch | `gfvdiczqyrvlmynvgegd` | Pre-prod soak |
| Development branch | `hborcpvarvgynjsjnfei` | Experiments |
| Rejected sibling | `qpqngtrhbmtctnklejrb` | **Do not use** |

Local CLI may link to production — always re-proof before mutate.
