# RD-P04E2 — Customer-facing offer URL migration

Status: In Progress — local validation pending

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

## Validation

1. `npm run typecheck`
2. promotion URL unit tests
3. `/offers/<known-slug>` renders the same landing content
4. `/campaigns/<known-slug>` returns a permanent redirect to `/offers/<known-slug>`
5. legacy query parameters survive the redirect
6. booking CTA still contains `?promo=` and promotion identity
