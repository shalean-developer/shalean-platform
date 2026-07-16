# FARAI-UAT Batch 1 — Synthetic fixtures implementation

| Field | Value |
|-------|-------|
| **Ticket** | FARAI-UAT-REM-01 / PR B |
| **Branch** | `fix/farai-uat-booking-blockers` (may split later) |
| **Date** | 2026-07-15 |
| **Scope** | UAT-DATA-001, UAT-DATA-002 |
| **Target** | Staging `gbgnemlpyykyhpqqbgru` only |

---

# Executive Decision

Idempotent seed/reset tooling added for eight scenario cleaners and four teams (2 Deep + 2 Move). Production ref is hard-refused.

---

# Test Data Added

| Scenario | Email / name |
|----------|----------------|
| Highly rated experienced | `uat-book-cleaner-01@shalean.test` / UAT Highly Rated Experienced |
| New cleaner | `…-02` / UAT New Cleaner |
| Average | `…-03` / UAT Average Cleaner |
| Unavailable | `…-04` / UAT Unavailable Cleaner |
| Outside area (Stellenbosch only) | `…-05` / UAT Outside Service Area |
| No deep/move capability | `…-06` / UAT No Deep Move Capability |
| Schedule conflict | `…-07` + `FARAI-UAT-BOOK-CONFLICT-*` booking |
| Eligible fallback | `…-08` / UAT Eligible Fallback Cleaner |

Teams: `UAT Deep Team Alpha/Bravo`, `UAT Move Team Alpha/Bravo`.

Locations upserted by slug (Sea Point, Claremont, Devil's Peak Estate, Simon's Town, etc.).

---

# Commands

```bash
node scripts/env/seed-uat-booking-fixtures.mjs --env staging
node scripts/env/seed-uat-booking-fixtures.mjs --env staging --reset
```

Documented in `docs/runbooks/staging-reset-and-reseed.md`.

---

# Files Changed

- `scripts/env/seed-uat-booking-fixtures.mjs`
- `docs/runbooks/staging-reset-and-reseed.md`

---

# Staging Verification

After seed: confirm cleaner/team counts, Claremont availability for Standard/Deep/Move, Paystack still test mode, production unchanged.

---

# Final Decision

**Conditional** until seed executed successfully on staging and booking smoke passes.
