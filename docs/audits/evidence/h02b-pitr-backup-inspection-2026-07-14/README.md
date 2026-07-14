# H02B PITR / Physical Backup Inspection (Read-Only)

**Captured at:** 2026-07-14T16:23:00+02:00 (Africa/Johannesburg)  
**Governance note updated:** 2026-07-14T16:50:00+02:00 (Africa/Johannesburg)  
**Command:** `npx supabase backups list --project-ref <masked> --output json`  
**Mutation:** none (list only; restore not executed)

## Summary

| Field | Value |
|-------|-------|
| Project | `shalean-platform` |
| Project reference (masked) | `tchaye****xlvfu` |
| Region | `eu-west-3` |
| `pitr_enabled` | **false** |
| `walg_enabled` | **true** |
| Physical backups returned | 8 (all `COMPLETED`) |
| Latest physical backup ID | `1108905187` |
| Latest physical backup `inserted_at` (UTC) | `2026-07-14T00:37:50.739Z` |
| Latest physical backup (Africa/Johannesburg) | `2026-07-14T02:37:50+02:00` |

## Infrastructure / product prerequisites (documented)

- PITR requires at least **Small** compute and a **paid PITR** retention add-on.
- Current production compute is below that minimum; Shalean has decided **not** to upgrade compute or purchase PITR at this time.
- Daily physical backups are present and completed (`walg_enabled: true`; eight completed backups verified).
- Physical backups are a controlled safeguard for a formal backup-only recovery exception; they are **not** equivalent to PITR (no arbitrary point-in-time restoration).

## Gate implication

- REC-01 parent: **EXCEPTION REQUIRED** — PITR unavailable by current infrastructure decision; backup-only exception model formalized in change-control; dual approval PENDING.
- REC-01A (PITR disabled + limitation documented): **PASS** (this folder + change-control exception section).
- REC-01B (latest physical backup verified): **PASS** (backup `1108905187` timestamp above).
- REC-01C…REC-01F: **PENDING** (named recovery owner, escalation, dual-approved exception, accepted RPO/RTO).
- REC-02 (recoverable timestamp): physical backup timestamp recorded above; does **not** satisfy PITR-enabled requirement and does **not** alone clear REC-01.
- Physical backup restore is **not** authorized by this package as a substitute for PITR without an explicit dual-approved recovery exception and named recovery authority.

## Human operator follow-up (dashboard)

If CLI and dashboard disagree, capture Supabase Dashboard → Project Settings → Database → Backups / Point-in-Time Recovery screenshots showing:

1. PITR toggle state (On/Off)
2. Recovery window (if any)
3. Latest restorable timestamp
4. Absolute capture time in Africa/Johannesburg

Attach evidence to the change ticket and update `docs/runbooks/h02b-production-change-control-2026-07-14.md`.

Raw JSON: `backups-list.json` (project ref may appear in full in the raw file; treat as sensitive project identity — do not copy credentials, tokens, or connection strings into governance docs).
