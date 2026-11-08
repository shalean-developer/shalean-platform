# CF-02 dashboard UI cleanup

Owner requested less text and visual alignment with the staging homepage. Reviewed its blue actions, navy headings, compact copy and clear sections in the hosted browser.

Scope: cash-flow presentation only. Use a compact finance header, four primary period cards, cleaner bank rows and native closed-by-default disclosures for source metadata, calculation rules, secondary balances/obligations and forecast rules. Keep fictional-data, reconciliation, missing/stale evidence, unavailable spendable cash/runway and provisional labels visible. Preserve all amounts, data hooks, permission controls, period matching, loading/error guards and accounting definitions. Empty charts use a compact explanation rather than a large empty canvas.

Extend isolated real-Chromium regressions at 390/768/1280px to verify keyboard disclosure toggling, secondary obligations, forecast rules, expanded overflow and retained-value suppression after opening secondary balances. Existing four scenarios and invalid-date regressions remain. The test server blocks external requests and uses synthetic data only.

Release through existing main → prebuilt staging bundle → deploy/staging → Plesk activation. Confirm exact SHA and environment safety after restart. Production needs separate owner approval; CF-02 stays open and dashboard owner acceptance remains pending. Source/settlement integrations are outside this cleanup.
