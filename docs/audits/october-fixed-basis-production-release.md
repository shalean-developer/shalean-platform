# October fixed earnings — bounded release

Production base: 711212958e9b7ff568bc0f8f0657d855a8602a3e.
Staging baseline: f2ad735681885c317053ed37beb8eb4b4a1d0eef.

## Approved corrections

Silibaziso: nine specified October visits at R280 each. Normatter: one at R280.
Elizabeth: one at R252. Lynne: Nyasha and Natasha at R260 each, including the
specified upcoming October bookings. Exact target IDs are recorded in
`october-earnings-basis-2026-10-15.md`. May–September remains deferred.
Preserve customer prices and payment/invoice history, payout locks, attribution
removal markers, roster identities, and the noncanonical shadow ledger.

## Runtime changes

Fixed-policy earnings use the approved recurring basis per actual participant.
Pending adjustment and roster changes refresh header ownership, net direct
payout/bonus, any existing summary, and member earned-basis rows atomically.
Signed deductions have individual zero floors. Financial-cap increases reject;
non-increasing unfunded corrections remain possible. Member rows retain earned
amounts. A positive member uses its own amount for eligibility even when the lead
is fully deducted; both linking RPCs accept an explicit zero parent basis while
preserving the deployed canonical date, month, invoice, refund and lock guards.
Null parent payout basis and existing invoice/payment/status/month
eligibility checks prevent unfunded payout candidates. Settlement therefore does
not need to restore previously zeroed member earnings.

Declared roster leads retain their participant-specific adjustment, regardless
of insertion order. Locked financial adjustments reject explicitly; creator-only
FK nulling retains the immutable audit email without refreshing locked payouts.
Dispute closure and an adjustment share one service-role-only transaction, so
rejected adjustments leave the dispute open. Retry cannot double-post. Unsupported
policies, services and formal-team adjustments reject before closing a dispute.

Summary-absent Office, finance, all-time, monthly, dashboard, jobs and job-detail
readers load policy and actual participant evidence. The unfunded lead can be
resolved from total earned obligation minus a complete set of member earned
rows. Partial peer coverage cannot manufacture an allocation. Internal inputs
are removed from cleaner API responses after resolving the viewer's amount.
Full participant summaries and adjustment reasons are also stripped from all job
list modes and job detail, verified through the actual endpoint handlers.
Historical, formal-team, undated and stale unrelated solo behavior is preserved.
Summary-absent company share follows obligation deltas, retaining its nonnegative
database constraint. A validated internal margin-capacity cache preserves the
original margin on reversal after zero-floor saturation; canonical value changes
invalidate it, explicit canonical margin updates are not applied twice, and present
summaries remove it. Cleaner bonus/base breakdowns use the net payable
above fixed basis when a summary is absent.
Today and daily-goal calculations reuse the complete earnings wire. Explicit zero
member allocations survive Office maps and cleaner cards; missing persisted job
earnings retain their valid runtime estimate or unavailable state.

## Evidence and outstanding gates

Earlier authenticated staging acceptance showed R260 per cleaner, R520 total,
one booking/two visits, ready/batched/paid zero and generation disabled. The
final baseline reset preview showed current R520, projected R520, change R0.
Fixture retirement returned exit zero; fresh reads confirmed is_test=true,
paused schedule, retained history and no financial links.

Local follow-up validation: 1,124 critical tests, TypeScript, booking-core lint,
migration checks and 217 isolated PostgreSQL assertions. The governed staging
acceptance SQL also passes isolated execution, rollback preservation and wrong
fixture rejection. It is staging-only tooling, excluded from production.
Twelve exploratory April-date persistence cases also fail on untouched production
71121295; those historical guards were not relaxed. The 23 canonical/paired
unit cases pass.

Fresh CI and independent review remain required on the final commits. Next:
merge staging follow-up; verify exact live SHA; apply reviewed function/trigger
DDL in staging; execute governed rollback acceptance and live UI checks; then
promote the bounded release and verify production SHA. Only then apply the
approved October corrections individually through guarded admin recomputation,
checking each result and unchanged financial/history evidence. Stop on any error
or skip. The migrations repair no existing records. No payment, transfer, batch
or payout approval is part of this work. Production October records have not
yet been corrected.
