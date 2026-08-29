# RD-P04F1 — Service-hub + metadata-parity closure hardening

Status: IMPLEMENTED — local validation pending
Branch: `design/rd04-platform-redesign`
Implementation head: `d7def8dafcd79e3449e635eb534eaab0473962ad`
Scope: presentation/metadata compatibility only; no production deployment or data mutation.

## Changes

### `/maid-services-cape-town`

- Replaced route-level `bg-white text-zinc-900` with semantic `bg-background text-foreground`.
- Replaced the `FooterSection` compatibility wrapper with canonical `SiteFooter`.
- Preserved `MarketingHomeHeader`, `MaidServicesCapeTownPage`, metadata, analytics, booking href, homepage/location data and service/location link authority unchanged.

Commit: `3d56d222` — `RD-P04F1: normalize maid services shell`

### `/cleaning-services-cape-town`

- Replaced route-level zinc surface styling with semantic `bg-background text-foreground`.
- Replaced generic `max-w-6xl px-4` wrapper with canonical `PublicPageContainer size="wide"` while preserving the existing section spacing.
- Kept `MarketingLayout` and every domain section component unchanged.
- Preserved metadata, JSON-LD, analytics, services, pricing, locations, blog links, FAQ and conversion behavior.

Commit: `9e36942f` — `RD-P04F1: normalize cleaning services hub shell`

### `/offers/[slug]` fallback metadata/content parity

- Restored generic fallback metadata title to `Campaign | Shalean`, matching the pre-migration campaign route.
- Restored generic QR copy to `QR code for this campaign landing page.` and alt text to `Campaign QR code`.
- Kept canonical `/offers/[slug]` routing, `/book?promo=` attribution, promotion lookup, analytics, content-driven metadata, terms sanitization, fallback soft landing and configured campaign colours unchanged.

Commit: `d7def8da` — `RD-P04F1: restore offer metadata parity`

## Diff boundary

Comparison from the RD-P04F audit baseline (`fa6ebd7f`) to implementation head (`d7def8da`) contains exactly three modified files:

1. `apps/web/app/(marketing)/maid-services-cape-town/page.tsx`
2. `apps/web/app/(marketing)/cleaning-services-cape-town/page.tsx`
3. `apps/web/app/(marketing)/offers/[slug]/page.tsx`

No booking, payment, referral rules, promotion eligibility, API, RBAC, Supabase schema/data or production configuration changes are included.

## Validation gate

Before RD-P04 can close:

1. Pull branch head `d7def8da` locally.
2. Run `npm --prefix apps/web run typecheck`.
3. Verify `/maid-services-cape-town` on desktop and mobile: one canonical header/footer, unchanged body content and CTA destinations, no horizontal overflow.
4. Verify `/cleaning-services-cape-town` on desktop and mobile: section hierarchy unchanged, canonical gutters, no clipping/overflow and one canonical footer.
5. Verify `/offers/spring-cleaning-special` returns 200 and still renders its landing content.
6. Verify an unknown `/offers/<slug>` returns 200 and fallback metadata resolves to `Campaign | Shalean`.
7. Verify `/campaigns/spring-cleaning-special?utm_source=test` remains a 308 to `/offers/spring-cleaning-special?utm_source=test`.

If these gates pass, mark RD-P04F1 and RD-P04 `PASSED / CLOSED`, then proceed to RD-P05.
