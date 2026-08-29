# RD-P04F — Public conversion pages closure audit

Status: BLOCKED — closure hardening required
Branch: `design/rd04-platform-redesign`
Audited head: `8beecb5df48029d195d21686b5db9f42c7a992f8`
Scope: presentation/compatibility closure only; no production deployment or data mutation.

## Closure evidence reconciled

### RD-P04A — inventory / authority boundary

The original audit identified the public conversion surface and required presentation-only changes that preserve metadata/canonicals, structured data, analytics, booking/quote/referral destinations, pricing authority, forms, CMS/Supabase data authority and backend behavior.

### RD-P04B — safe shell normalization

Passed/closed evidence covers:
- `/about`
- `/reviews`
- `/areas-we-serve`
- `/cleaning-prices-cape-town`

These routes were normalized to semantic page roles and canonical footer usage while preserving their page-owned data, SEO, tracking and destination behavior.

### RD-P04C — Contact + FAQ

Passed/closed evidence covers desktop/mobile validation, FAQ sticky mobile CTA usability and clean typecheck. Contact form/support routing and FAQ JSON-LD/data/search/filter behavior remained authoritative.

### RD-P04D — specialized Quote

Passed/closed evidence covers desktop/mobile validation and clean typecheck. `QuoteRequestForm`, metadata/JSON-LD, analytics, support destinations and the `/book` instant-price diversion remained unchanged.

### RD-P04E — referral conversion

Passed/closed evidence:
- referral unit coverage: `referralShareUrls.test.ts` + `client.test.ts` = 2 files / 10 tests passed;
- `/refer` returned 200 on a clean local Next process;
- a real referral URL rendered the invited-friend experience;
- the referral code survived into `/book?ref=<REALCODE>`;
- the supplied copied public referral URL used the canonical `https://shalean.co.za/refer?ref=<REALCODE>` form;
- no booking/payment completion or production mutation was required.

### RD-P04E2 — customer-facing offer URL migration

Passed/closed behavioral evidence:
- canonical `/offers/spring-cleaning-special` returned 200;
- a guaranteed fallback `/offers/<unknown-slug>` returned 200;
- legacy `/campaigns/spring-cleaning-special?utm_source=test` returned 308;
- redirect location preserved the query parameter: `/offers/spring-cleaning-special?utm_source=test`;
- promotion URL helper tests passed 5/5 and typecheck was clean in the completed slice;
- promotion lookup, `landing_visit`, `/book?promo=`, terms sanitization, expired-offer soft landing and legacy URL compatibility remain intact.

## Responsive / accessibility closure check

Evidence already recorded for RD-P04B/C/D includes desktop/mobile visual validation and no visible horizontal overflow. Referral validation supplied both referrer/friend render evidence and a working booking CTA with retained attribution.

Static code review confirms the normalized pages continue to use semantic links/buttons rather than replacing behavior-bearing controls. FAQ interaction remains domain-owned, campaign FAQs retain native `details`/`summary`, QR rendering retains alt text, and conversion forms were not replaced.

Two service-hub routes from the original RD-P04A inventory are not yet at the same shell baseline, so responsive/accessibility consistency cannot be signed off for the full RD-P04 route family yet.

## Closure blockers

### Blocker 1 — `/maid-services-cape-town` was inventoried but not normalized

Current route still uses:
- hard-coded `bg-white text-zinc-900` at the route root; and
- the legacy `FooterSection` compatibility wrapper.

RD-P04A explicitly identified this service hub as part of the conversion-page family and required an interior/shell audit before closure. No implementation change for this route appears between the RD-P04A audit commit and the audited head.

Required closure action: semantic root normalization and canonical footer adoption, preserving metadata, analytics, location/service link authority, booking href and `MaidServicesCapeTownPage` behavior.

### Blocker 2 — `/cleaning-services-cape-town` remains partially route-local

This route already uses `MarketingLayout`, which resolves to canonical `SiteFooter`, but its main shell still owns direct zinc background roles and `max-w-6xl px-4` container styling.

Required closure action: determine whether those styles are intentional domain-specific composition or normalize the generic root/gutter portion to the approved semantic/container system. Preserve metadata, JSON-LD, analytics, services, pricing, location links and all domain components.

### Blocker 3 — E2 fallback metadata parity drift

Before the URL migration, missing/expired campaign metadata fell back to `Campaign | Shalean`. The canonical `/offers/[slug]` route now falls back to `Offer | Shalean`. Generic QR wording also changed from campaign terminology to offer terminology.

Real promotion metadata remains data/content-driven, so this does not break promotion identity or attribution. However, E2's compatibility requirements explicitly said to preserve campaign metadata/content. Without a separate approved copy/SEO decision, exact fallback metadata parity should be restored or explicitly approved as an intentional terminology change before RD-P04 closes.

## Tracker hygiene

The programme tracker contains stale records that should be corrected as part of this closure audit:
- RD-P04B still says `IN PROGRESS — LOCAL VALIDATION PENDING` even though it passed/closed.
- RD-P04E still says `IN PROGRESS — BROWSER VALIDATION PENDING` even though referral browser validation is complete.
- RD-P04E2 is already correctly recorded as passed/closed.

## Final RD-P04F decision

**RD-P04 remains OPEN / BLOCKED.**

The completed conversion behavior is healthy; the remaining work is small presentation/metadata closure debt. Do not reopen booking, payment, referral business logic, promotion eligibility, analytics or production data.

Recommended next controlled slice:

### RD-P04F1 — service-hub + metadata-parity closure hardening

1. Normalize `/maid-services-cape-town` semantic shell/footer only.
2. Normalize only the generic root/gutter portions of `/cleaning-services-cape-town` if the route-local styling is not intentional; keep domain components intact.
3. Restore E2 fallback metadata/content parity unless an explicit terminology change is approved.
4. Run latest typecheck and targeted local desktop/mobile smoke for both service hubs plus `/offers/<slug>`.
5. If clean, mark RD-P04 `PASSED / CLOSED` and proceed to RD-P05.

## Authority preserved

RD-P04F does not authorize or change:
- production deployment or Vercel configuration;
- Supabase production schema/data;
- booking/payment/pricing logic;
- referral eligibility/reward rules;
- campaign/promotion eligibility or stored data;
- RBAC/session/auth behavior;
- CMS/location/service authority.
