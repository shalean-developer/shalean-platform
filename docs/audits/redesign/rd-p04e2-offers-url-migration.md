# RD-P04E2 — Customer-facing offer URL migration

Status: PASSED / CLOSED
Branch: `design/rd04-platform-redesign`

## Decision

- Canonical customer-facing promotion route: `/offers/[slug]`.
- Legacy public route `/campaigns/[slug]` remains compatible through a permanent redirect.
- Internal promotion/campaign domain naming remains unchanged.

## Compatibility requirements

- Preserve promotion lookup by slug and existing promotion content authority.
- Preserve `landing_visit` analytics and `CampaignLandingClient` behavior.
- Preserve `/book?promo=...` booking attribution.
- Preserve incoming query parameters on legacy `/campaigns/[slug]` redirects (for UTM, QR, social, and other shared-link parameters).
- Normalize newly emitted public promotion URLs to `/offers/[slug]` while accepting stored legacy `/campaigns/...` landing paths.
- Preserve campaign metadata/content, sanitized terms, expired-offer soft landing behavior, QR rendering, and custom campaign colours.

## Out of scope

- No promotion database migration.
- No campaign content rewrite.
- No booking, pricing, payment, Supabase schema, or promotion eligibility changes.
- No production deployment.

## Validation result

Passed:

1. Completed-slice typecheck was clean.
2. Promotion URL helper tests passed 5/5.
3. `/offers/spring-cleaning-special` returned 200 locally on a clean Next process.
4. `/offers/rd-p04e2-definitely-not-a-real-offer` returned 200, confirming soft fallback behavior.
5. `/campaigns/spring-cleaning-special?utm_source=test` returned `308 Permanent Redirect`.
6. Redirect location preserved the query parameter: `/offers/spring-cleaning-special?utm_source=test`.
7. Booking attribution and promotion identity remain owned by `/book?promo=...`.

RD-P04E2 is **PASSED / CLOSED** for URL migration behavior.

## Closure-audit note

RD-P04F identified a small metadata-parity question that does not invalidate the URL migration behavior: the generic missing/expired fallback title changed from `Campaign | Shalean` to `Offer | Shalean`, and generic QR wording changed from campaign to offer terminology. Because the compatibility requirement said to preserve campaign metadata/content, RD-P04F keeps the overall RD-P04 stage open until that terminology drift is either restored or explicitly approved as intentional.
