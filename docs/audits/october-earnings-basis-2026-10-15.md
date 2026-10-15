# October earnings basis convergence

Owner authorization, 15 October 2026: Silibaziso's nine identified October visits
use R280 each, Normatter's 8 October visit uses R280, Elizabeth's 8 October
visit uses R252. Lynne's bookings use R260 for BOTH Nyasha and Natasha.

May–September is excluded from repair. Keep the two October payout-attribution
removal markers active. Keep the shadow ledger non-canonical. Do not generate
October batches before month closure. No payments, transfers or payout approval.

## Cause and prevention

The database preserves the recurring fixed rate on the booking header, but the
application can persist current percentage calculations into summaries, line
earnings and snapshots. Apply the persisted legacy policy basis before producing
those derived representations. A paired fixed rate is per participant, so the
database's internal cost and financial-cap check must use the participant count.
The new behavior is limited to October onward and excludes formal team jobs.

## Authorized correction targets

| Booking | Cleaner | Before | Basis |
| --- | --- | ---: | ---: |
| 1f653ed2-e6ef-41d5-a32f-424a384ef083 | Silibaziso | R300 | R280 |
| d2feaa91-550d-443a-85b2-e97286f1bb30 | Silibaziso | R300 | R280 |
| 23deee1e-dedd-4304-9e0b-b8326f90ca08 | Silibaziso | R300 | R280 |
| 60be8738-fab0-41ae-993b-90d07e27855e | Silibaziso | R300 | R280 |
| fdf7bae7-5365-404a-aee3-71201c9d2a47 | Silibaziso | R300 | R280 |
| 6baf3f4b-07b2-4d1a-8ffe-f6d7b910534d | Silibaziso | R300 | R280 |
| d5151bae-6441-425a-828e-92c68e893855 | Silibaziso | R300 | R280 |
| 1b1aef6b-b4f7-49d1-9fab-78730c5582fc | Silibaziso | R300 | R280 |
| ca461d9b-30f7-4fc5-a852-08381b1f209f | Silibaziso | R300 | R280 |
| ebfe7473-df73-4fe3-a6fa-cc8b73fbcee4 | Normatter | R270 | R280 |
| d3045658-7993-475e-a9fc-94b4c79f7ce0 | Elizabeth | R250 | R252 |

Lynne's recurring plan a053ea81-185e-4434-9851-9619ee79f1a2 has five completed
October bookings (1, 5, 8, 12 and 15 October), plus four assigned upcoming visits
(19, 22, 26 and 29 October). The plan's existing fixed basis is R260. Recompute
each approved current booking through the guarded admin earnings flow after
release. Preserve roster identities, customer invoice/payment state and schedule.
The non-lead member row must become R260; no separate lead member row is needed.

## Gates and execution

This migration changes function behavior only; it performs no data repair.
Before any correction, re-read the target and fail closed on paid/frozen/run/
disbursement linkage, changed identity, attribution-removal marker, or a date
outside October. Capture before/after snapshots and compare untouched records.
Use the existing admin reset/recompute safeguards, one booking at a time, and
stop on any error or unexpected skip. Verify header, summary, line/snapshot,
member and shadow-ledger representations according to their distinct roles.

Required gates: local tests/typecheck/lint/migration checks; independent review
and CI; staging migration and populated verification; bounded production release
and automatic deployment; live release SHA; production migration; target repair;
then reconciliation. No repair or stage closure is claimed by this source PR.
