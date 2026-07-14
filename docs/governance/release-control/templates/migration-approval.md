# Production migration approval template

**Does not authorize** customer domain promote.

| Field | Value |
|-------|-------|
| Change ID | |
| Title | |
| Exact Git versions to apply / repair | |
| Target project ref | `tchayecuvzssixyxlvfu` (production) — re-proof: |
| Tooling | Supabase CLI with Git stamps only |
| Evidence SQL will / will not re-run | |
| Dry-run expected pending set | |
| Verification SQL | |
| Stop / rollback conditions | |
| PITR/backup awareness | PITR currently **disabled** — backup exception path only |
| Staging precondition | Staging history Git-aligned: YES / NO |
| Database Owner approval | |
| Release Manager approval | |
| Timestamp (Africa/Johannesburg) | |

## Forbidden

- MCP `apply_migration` for governed releases
- Dashboard ad-hoc DDL
- `--include-all` speculative push
- Re-running SQL to heal metadata skew

## Post-execution

| Check | Result |
|-------|--------|
| `schema_migrations` contains approved versions | |
| Object verification SQL | |
| Hand-off to Deployment Approval | Ready / Hold |
