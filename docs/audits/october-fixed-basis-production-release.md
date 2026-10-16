# October fixed earnings — bounded production release

Base: production 711212958e9b7ff568bc0f8f0657d855a8602a3e.
Source: reviewed #956, #957 runtime reset safeguards, #958 preview correction;
main f2ad735681885c317053ed37beb8eb4b4a1d0eef.

Approved scope: Silibaziso nine October visits at R280 each; Normatter one at
R280; Elizabeth one at R252; Lynne's Nyasha and Natasha at R260 each. Full target
IDs are in october-earnings-basis-2026-10-15.md. May–September is deferred, not
cleared or reconciled. Keep intentional attribution removals and ledger noncanonical.

Staging runtime health supplied 2026-10-16T07:58:30.094Z matched source above,
staging DB, test/test payments, outbound disabled, issues empty. The authenticated
AUDIT956 booking showed both R260, total R520 after a guarded reset. Database
summary and internal total52000/member26000 agree, member pending/unlinked,
solo ledger count0, customer pending/cash0, payout/run/paid links null. Payouts
showed one booking/two visits/R520, ready/batched/paid0, generation disabled.
On the final runtime the reset confirmation showed exactly After reset R520,
current R520, change +R0. Cancelled the preview without another mutation.

Staging fixture retirement passed with exit 0. A fresh database read confirmed
is_test=true, retained history, paused schedule and no payment/batch/transfer links.
No private keys are available to the agent.

Include only earnings source, preview, reset safety, focused regressions and the
new policy migration. Preserve production workflow and add only the required
isolated policy test; no staging seed or unrelated main changes are promoted.

Gates remaining: CI and clean independent release review; verified fixture
retirement; merge production and automatic deploy; exact live runtime SHA;
reviewed production migration; individual guarded October reset/recompute;
compare representations and unchanged financial/history evidence. The migration
changes functions/triggers only and repairs no existing records. Before each
repair re-read identity/date/payout locks, stop on any error/skip, and verify each
result before continuing. No payment, transfer, batch or approval is authorized.

Release review found two further blockers. The proposed follow-up atomically
refreshes fixed-policy pending payable columns, member rows and present summaries
on adjustment INSERT/UPDATE/DELETE. It preserves frozen line items/snapshots and
historical/settled records. Negative adjustments reduce the net payable rather
than disappearing from positive-only bonus columns. The preview reads distinct
actual roster participants and internal obligation, including unequal adjustments.
These additions still require CI, independent review and fresh staging verification.
Production has not been promoted and October records have not been corrected.

Further release review coverage: roster changes also rebuild summaries/member
rails and replace/remove the direct owner when that owner leaves the actual
roster. An adjustment exceeding the visit financial cap aborts atomically.
Unpaid visits expose no member payable; financial-field changes restore payable
rails after settlement. Shared finance/October cleaner readers consume adjusted
participant totals, while May–September and stale solo basis locks are preserved.

Additional exploratory persistence-suite check: the same 12 legacy April-date
cases fail on the untouched production baseline 71121295 and this branch because
historical persistence is deferred. The 23 canonical/paired unit cases pass.
These baseline failures are outside the enforced critical suite and this October
scope; historical mutation guards were not relaxed to satisfy those old tests.
