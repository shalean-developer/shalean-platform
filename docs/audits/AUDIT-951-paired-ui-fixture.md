# AUDIT-951: populated staging UI fixture

Scope: one synthetic completed non-team booking, two distinct synthetic cleaners,
R250 per cleaner / R500 total, customer quote R650. No real customer, payment,
invoice, payout batch, transfer, dispatch offer or notification is requested.
This is reporting-state setup, not proof of application completion orchestration.
Database lock/trigger behavior is separately proven by #952.

## Before apply

Clean review and CI are required for the exact script head before remote use.
Configure server-only credentials privately in the operator's environment, never
in chat or committed files. Install apps/web dependencies with its locked npm ci.
Required variables: SHALEAN_APP_ENV=staging, AUDIT_STAGING_REF,
SEED_ALLOWED_PROJECT_REFS (exactly that one staging ref),
SUPABASE_PROD_REF, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
AUDIT_STAGING_SITE_URL (canonical HTTPS staging origin only).
The runner checks live health: both project refs match staging, test/test payment
keys, outbound disabled, and no health issues. The entry point is the governed scripts/seed-dev.mjs command; its common
non-production guard runs before the fixture module. Existing rows must match
the owned namespace, unsettled state and exact financial basis. Failed writes
fail acceptance. Partial fixtures stay is_test=true until every step completes;
rerun the same command to resume missing rows without hard deletion or duplication.

`npm run audit:paired-ui:plan` is local and needs no credentials.
After the gates, `npm run audit:paired-ui:apply` creates the fixture.

The booking deliberately uses is_test=false because the actual production report
excludes is_test=true. It has a reserved reference, synthetic metadata, @example.com
recipients and impossible +27000 numbers, and exists only on approved staging.
Do not press Generate, Freeze, Approve, Create run, Mark paid, or send messages.
The customer payment is pending and amount_paid_cents=0; no capture is fabricated.
The R650 total_paid_zar field is the application's legacy quoted-total field.

## Browser acceptance

Open /office/payouts on the same verified staging origin, select the fixture's
Johannesburg date range, then Refresh. Relative to the pre-fixture baseline:

- Bookings +1; cleaner visits +2; earned +R500.
- Audit951 Lead and Audit951 Member each show one visit and R250.
- Their visit detail points to booking 95110000-0000-4000-8000-000000000001.
- No paid/batched totals increase. An open month cannot generate batches.
- Inspect the booking detail: exactly two roster members, non-team, R500 total.
- Capture the rendered page and compare database rows: member rail R250,
  booking lead rail R250, aggregate R500, no solo cleaner_earnings row.

This Office check does not establish authenticated cleaner-dashboard acceptance.
Do not claim that separate surface was tested without testing it.

## Retirement and reconciliation

After evidence capture run `npm run audit:paired-ui:retire`. It fails closed on
booking settlement, member locks or an unexpected solo ledger, and changes only
the owned booking's is_test to true. It retains synthetic financial history and
identities; it never bypasses hard-delete guards. A later apply can resume the retained ID after validating all ownership and
settlement guards; it preserves the original visit date and financial basis.
Recheck reports return to their baseline and non-fixture row hashes are unchanged.
The --reset path retires this fixture only; it never invokes the broad seed reset.
Partial setup records may remain after failure; identify them by the reserved
UUIDs/reference/emails and do not delete or mutate unrelated records.

Production promotion stays pending until acceptance and reconciliation are recorded.
