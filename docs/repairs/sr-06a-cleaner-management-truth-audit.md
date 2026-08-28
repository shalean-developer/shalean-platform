# SR-06A — Cleaner Management source-of-truth audit

Status: In Progress
Target: `integration/shalean-repairs`
Scope: read-only audit evidence; no production data changes.

## Authority basis

SR-06 is being anchored to the existing P6 Workforce & Quality / Cleaner Management implementation already present in this repository. The retrieved programme artifacts do not contain a separate formal SR-06 label, so this slice does not invent new business policy; it audits the existing cleaner-management truth model and carries forward established P6 safety boundaries.

## Existing P6 truths to preserve

- Cleaner lifecycle is separate from dispatch availability.
- Cleaner records are archived non-destructively using the existing lifecycle state; historical booking, team, training, earnings and payout relationships must remain intact.
- Performance and quality evidence must come from canonical operational ledgers, not fabricated UI values.
- Cleaner management must not mutate payout or customer-finance truth as a side effect of workforce actions.

## Findings

### P0 — cleaner detail API bypasses centralized permission authority

`apps/web/app/api/admin/cleaners/[id]/route.ts` defines its own `requireAdminFromRequest` helper and only checks that the caller is an admin. The GET and PATCH handlers do not enforce the centralized `cleaner.view` / `cleaner.edit` permission boundary used by the Office policy.

Risk: an authenticated lower-privilege admin may be able to read or mutate cleaner records even when the Office page policy would deny the corresponding action.

Required repair:
- GET must require `cleaner.view`.
- PATCH must require `cleaner.edit`.
- retain the existing UUID validation and server-only Supabase access.
- add regression coverage proving denial happens before database access for callers without the required permission.

### P1 — Cleaner Management lifecycle/availability metrics use conflicting semantics

`OfficeCleanersManageView.tsx` currently:
- labels lifecycle count as `Active today` while counting `is_active !== false`;
- counts `Available now` from `is_available` only;
- filters status using raw `status`;
- renders the visible status using a separate helper that also considers `is_available`.

Risk: the same cleaner can be counted, filtered and displayed differently. `is_active` is a lifecycle flag, not a same-day activity signal.

Required repair:
- lifecycle metric wording must describe lifecycle truth (for example `Active cleaners`).
- available-now calculation and status filtering must use one shared canonical availability interpretation.
- preserve the approved three-state Office presentation (Available / Busy / Offline) unless a later approved policy changes it.

## Non-findings / preserved behavior

- Cleaner list data is sourced from `public.cleaners` and includes both `is_active` and `is_available` explicitly.
- Existing archive behavior is non-destructive and separates lifecycle from dispatch eligibility.
- Existing assignment history reads both direct `bookings.cleaner_id` and team-roster `booking_cleaners` relationships.

## SR-06A acceptance gate

SR-06A is complete only when:
1. cleaner detail GET/PATCH use centralized `cleaner.view` / `cleaner.edit` authority;
2. regression tests prove unauthorized calls fail before DB access;
3. lifecycle and availability metrics no longer use contradictory semantics;
4. targeted cleaner-management tests and typecheck pass;
5. CI is green on a PR targeting `integration/shalean-repairs`.

No merge to `main` is permitted as part of this slice.
