# Staging to Production Promotion — 2026-08-04

This promotion carries the validated Priority 3 RBAC and Supervisor workspace changes from `staging` to `main`.

Included:
- Role-based Office workspace and My Work queue
- Financial visibility permissions and redaction
- Supervisor team-scoped bookings and schedule
- Team Performance workspace
- Supervisor dashboard simplification
- RBAC regression tests and migration governance

The production-only `apps/web/vercel.json` change on `main` must be preserved by the merge commit.
