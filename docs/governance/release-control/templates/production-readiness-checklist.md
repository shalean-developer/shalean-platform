# Production readiness checklist template

Use for any customer-visible release. Feature-specific lists (e.g. R1) extend this.

## Scope

- [ ] Scope frozen (SHA, migrations, exclusions written)
- [ ] Change ID assigned
- [ ] Risk Register items reviewed

## Release control

- [ ] GitHub `main` ruleset / protection verified active
- [ ] Vercel production domain auto-assign disabled (or staged promote confirmed)
- [ ] Named roles assigned for this release window

## Artifact

- [ ] RC identified (SHA + deployment ID)
- [ ] Customer domains still on prior known-good (pre-promote)

## Staging

- [ ] Staging green (schema + history + smoke)
- [ ] Staging bound to staging Supabase

## Database (if applicable)

- [ ] Migration Approval dual-signed
- [ ] Production migrate done + verified
- [ ] No MCP / dashboard DDL used

## Promote

- [ ] Go recorded
- [ ] Deployment Approval signed
- [ ] Instant Rollback target recorded
- [ ] Team-scoped promote executed
- [ ] Hostname → `dpl_…` verified
- [ ] Production smoke PASS
- [ ] Release evidence pack filed
- [ ] 24h watch owner named
