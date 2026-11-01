# Header accessibility and blog image loading — bounded repair

Scope: SEO-A11Y-01, SEO-A11Y-02 and SEO-PERF-02. Owner instructed to proceed with performance, mobile rendering and accessibility after eleven production-verified closures. Main baseline c609f9d3d8b93a754d3e062cddbd671886316cfb; production baseline 05f0f2f5b557f6b10e5cad2db810fb732c1bd371.

## Verified defects and changes

- SEO-A11Y-01: desktop search input declares aria-expanded without a role supporting expansion. Preserve native search input semantics and move expanded/control state to a real Services disclosure button. Label the controlled result region. Existing search/filter/Enter navigation is preserved; no incomplete combobox role is introduced.
- SEO-A11Y-02: Escape leaves desktop Services and mobile navigation open in the connected browser. Close open header disclosures on Escape; restore focus when the key originates inside the affected panel, retain outside focus, preserve query and avoid navigation.
- SEO-PERF-02: live blog index at 390×844 has five eager card images starting at y=2298.6, 2758.2, 4532.0, 4991.6 and 5451.2. Change the two below-featured card sections to lazy loading; retain featured-image priority/preload, dimensions and all links/content. Native lazy-loading request distance is browser-controlled, so no exact request/latency saving is claimed.

## Evidence limits

SiteGuru's retrieved stored report has 40 measured URLs and nine scores below 90, versus the older 48/37 snapshot. Measurement device/date are absent; no improvement attribution or field-CWV conclusion is supported. PageSpeed live API refused a new mobile blog request with HTTP 429 daily quota exhausted. GSC Wizard's previously verified inactive plan prevents field-data reads. Broader SEO-PERF-01 remains open.

Desktop Chrome viewport emulation at width 390 found no horizontal overflow and one H1 on homepage, blog index, move-out service, location directory and pricing article. This is not actual handset/Safari/assistive-technology certification; SEO-MOBILE-01 remains open. One initial staging navigation on the unchanged baseline showed React 412; one reload recovered. No recurring defect/root cause is established; monitor new deployed rendering and do not attribute that observation to this source change.

## Validation and acceptance

Eight focused regressions exercise both header modes, desktop/mobile Escape and focus return, search disclosure state, query preservation, Enter navigation, outside focus, and complete blog-index SSR with lazy cards/featured preload. Source critical suite: 1,667 tests across 147 files passed. TypeScript and changed-file lint passed, with the original header ARIA warning removed. Booking lint passed with four existing warnings.

Production candidate is independently based on production; original changed source files matched before transfer. Preserve the production critical list, adding only two regression paths. No new dependencies, data requests, analytics/configuration, booking/pricing/auth logic, article copy/dates, routes/canonicals/robots/sitemap, CMS/database/financial records or indexing submissions.

Before release: final-head CI, exact-SHA healthy staging/test configuration, public HTML image/ARIA checks, desktop/mobile browser Escape/focus behavior, filter/navigation, no overflow at representative widths and screenshots of public UI. Restore the temporary viewport after verification. Owner production acceptance precedes bounded deployment; production reconciliation precedes closure. Rollback: revert this source slice through the existing release path, retaining eleven prior repairs.

References:
https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/
https://nextjs.org/docs/app/api-reference/components/image

Canonical tracker: https://github.com/shalean-developer/shalean-platform/blob/audit/seo-remediation-20261101/docs/audits/seo/SEO-REMEDIATION-TRACKER-2026-11-01.md


## Staging visual correction

Exact-SHA staging 66ca83c95d7cebdc514ff5ea1fe4b484bd6fce32 exposed a CSS override: marketing header `div:hover > div` forced a closed (aria-hidden=true) Services panel visible under the pointer. Escape state/focus assertions alone did not catch this. Restrict the hover visual rule to aria-hidden=false panels so the controlled disclosure remains authoritative; the Services button still opens it. Eight focused component/SSR cases passed again. Browser acceptance must verify computed visibility/opacity plus screenshot while pointer remains over the trigger. This is part of SEO-A11Y-02, not a new redesign.

Staging blog has no published posts. Deployed blog-card loading/featured preload cannot be observed there; fixture SSR regression covers policy, and exact production HTML remains mandatory before closing SEO-PERF-02. Desktop search is hidden by the existing marketing CSS at >=80rem, independently of sign-in; test at visible desktop breakpoint plus mobile. No CMS fixtures were created.
