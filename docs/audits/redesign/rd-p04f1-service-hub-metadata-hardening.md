# RD-P04F1 — Service-hub + metadata-parity closure hardening

Status: VALIDATION PENDING — redirect topology corrected
Branch: `design/rd04-platform-redesign`
Scope: presentation/metadata compatibility only; no production deployment or data mutation.

## Runtime correction discovered during validation

Local validation showed:

- `/maid-services-cape-town` returns `308`;
- `/cleaning-services-cape-town` returns `308`;
- both redirect to the canonical `/services` hub through `resolveLegacyMarketingExactRedirect()` in `proxy.ts`.

The exact redirect matrix confirms both paths are intentional permanent legacy aliases:

- `/cleaning-services-cape-town` → `/services`
- `/maid-services-cape-town` → `/services`

Because the proxy resolves these redirects before page rendering, the route files at those legacy paths are not active customer-facing conversion surfaces. The initial RD-P04F closure audit incorrectly treated their dormant presentation code as runtime blockers.

## Corrective action

The two presentation-only edits made to the unreachable legacy page files were reverted:

- `ba9773e6` — revert unreachable maid alias styling
- `13af9b17` — revert unreachable cleaning-services alias styling

No SEO redirect behavior was changed.

The canonical active service hub is `/services`. Static review confirms it already uses `MarketingLayout`, which resolves to canonical `SiteFooter`, while its section-level blue/zinc presentation remains domain-specific service-hub composition. No additional service-hub code change is required for this closure slice; it requires visual smoke validation only.

## `/offers/[slug]` fallback metadata/content parity

The valid F1 hardening remains in place:

- fallback metadata title restored to `Campaign | Shalean`, matching the pre-migration campaign route;
- generic QR copy restored to `QR code for this campaign landing page.`;
- QR alt text restored to `Campaign QR code`.

Canonical `/offers/[slug]` routing, `/book?promo=` attribution, promotion lookup, `landing_visit`, content-driven metadata, terms sanitization, fallback soft landing and configured campaign colours remain unchanged.

Commit: `d7def8da` — `RD-P04F1: restore offer metadata parity`

## Validation evidence received

- Local branch pulled successfully to the F1 implementation series.
- `npm --prefix apps/web run typecheck` passed cleanly.
- `/offers/spring-cleaning-special` returned `200`.
- unknown `/offers/rd-p04f1-fallback-check` returned `200`.
- `/campaigns/spring-cleaning-special?utm_source=test` returned `308` with location `/offers/spring-cleaning-special?utm_source=test`.
- `/maid-services-cape-town` and `/cleaning-services-cape-town` returned the expected legacy `308` responses.

## Remaining closure gate

1. Pull the latest branch after the corrective reverts.
2. Confirm `/services` returns `200`.
3. Visually smoke `/services` on desktop and mobile for one public header/footer, intact service hierarchy/CTAs, no clipping or horizontal overflow, and usable sticky mobile CTA.
4. Optionally inspect the unknown-offer document title and confirm the fallback title is `Campaign | Shalean`.

If these gates pass, mark RD-P04F1 and RD-P04 `PASSED / CLOSED`, then proceed to RD-P05.

## Authority boundary

No booking, payment, pricing, referral rules, promotion eligibility, API, RBAC, Supabase schema/data, SEO redirect topology or production configuration changes are authorized or included.
