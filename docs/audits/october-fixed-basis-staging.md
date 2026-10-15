# Fixed October earnings — populated staging acceptance

Follow-up to #956: the explicit office Reset & recompute action now requests
`force=true`. Otherwise the database restores a legacy fixed header during reset,
and persistence can return early without rebuilding stale summaries or snapshots.
Existing historical/paid/frozen safety guards still run before reset.

The governed seed has a separate `--paired-ui-only --fixed-legacy` mode. It uses
AUDIT956 IDs, two synthetic cleaner identities, an example.com customer identity,
and a paused recurring schedule with R260 fixed earnings. It does not copy real
customers or change AUDIT951 history. All existing staging health, allowlist,
identity, financial linkage, collision, resume and retirement guards apply.
The schedule remains paused when evidence is retained after retirement.

## Execution

Run only after the final source commit is reviewed and merged, and the matching
automatic staging runtime is verified. In the existing isolated Windows checkout,
with the staging-only service-role key supplied privately in the process environment:

```powershell
npm run audit:locked-ui:plan
npm run audit:locked-ui:apply
Write-Host "Fixture exit code: $LASTEXITCODE"
```

Do not print the key or paste it into chat. Required environment settings are the
same as the approved AUDIT951 run: staging app environment, distinct staging/prod
refs, staging-only seed allowlist, staging Supabase URL and staging site origin.

Open the staging booking:
`/office/bookings/95610000-0000-4000-8000-000000000001`.
Confirm two synthetic cleaners, R260 each/R520 total, unpaid customer state, and
October generation disabled. Run Reset & recompute once in this synthetic booking;
confirm the operation recomputes rather than skips. Re-read the booking summary,
internal total and R260 non-lead member payout; no solo ledger row should exist.
Confirm payment/batch/transfer evidence remains absent. Reload the booking and
payouts pages and verify the same amounts. Do not approve/freeze/generate/pay.

Only after capturing acceptance evidence:

```powershell
npm run audit:locked-ui:retire
Write-Host "Retirement exit code: $LASTEXITCODE"
```

Verify exclusion from reports and retained history. A successful apply by itself
is not browser acceptance. Production promotion and October record repair remain
separate pending gates. May–September is excluded.
