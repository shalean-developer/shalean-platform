# Pre-Relink Safe Evidence Snapshot
Date: 2026-07-14
CLI: 2.109.1
Git branch: staging
Git HEAD: 99526d72fca841fdc189eaf33720655a564675b0
origin/main: 99526d72fca841fdc189eaf33720655a564675b0

## Active --linked identity (authoritative: project-ref)
- ref: hborcp****jnfei
- role: Supabase preview branch `development`
- parent: tchaye****xlvfu
- with_data: false

## Stale linked-project.json
- name: shalean-platform
- ref: tchaye****xlvfu
- org: cfzsfp****
- NOTE: stale parent metadata; must not be trusted alone

## Pooler (masked)
- tenant: hborcp****
- host: aws-0-eu-west-3.pooler.supabase.com
- secrets: not recorded

## Data shape (SELECT-only via --linked)
- auth.users: 0
- public.bookings: 0

## Migration list --linked (branch, not production)
- remote+local: 20260714010000
- local-only Phase 1.11: 20260714120000..20260714130200 (8)
- archaeology remote-only: none (expected for empty preview)

## Rejected alternatives (not linked)
- qpqn**** (shalean project)
- gfvdic**** (staging preview)

## Safety
- No tokens, passwords, JWTs, or full connection strings copied
- No database mutation

## Post-Relink Confirmation (same day)
- project-ref: tchaye****xlvfu
- linked name: shalean-platform
- pooler tenant: tchaye****
- pooler host: aws-1-eu-west-3.pooler.supabase.com
- region: eu-west-3
- projects list linked: true for shalean-platform; false for shalean project
- auth.users: 167
- public.bookings: 432
- migration history: 12 archaeology remote-only + baseline local-only + 8 Phase 1.11 local-only
- Full write-up: docs/audits/h02b-production-relink-read-only-verification-2026-07-14.md
