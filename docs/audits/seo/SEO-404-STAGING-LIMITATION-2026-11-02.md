# SEO-INDEX-01 — spring checklist staging content limitation (2026-11-02)

## Scope
The bounded PR #1031 deployed on staging at cdbdad5581634c45ab4734799f30eab9cd5308f8. Owner's six-path HTTP proof:

- /services/one-time-cleaning => 308 /services/standard-cleaning-cape-town => 200 staging noindex
- /booking/quote => 308 /quote => 200 staging noindex
- /blog/spring-cleaning-checklist-south-africa => 308 /blog/spring-cleaning-checklist-cape-town => 404 staging noindex

## Proven source of truth
Read-only production Supabase blog_posts query on project paqjwfulwywtsyyvdxrq returned slug spring-cleaning-checklist-cape-town, status published, title 'Spring Cleaning Checklist for Cape Town Homes', published 2026-08-01T15:50:50Z. Read-only staging query on uwvnmluiqbczeduzjgse returned no rows for either checklist slug. The governed redirect target has no in-repo post; CI governance now permits this *one* verified published CMS slug. PR #1031 final checks passed. No production CMS edit or copy was performed.

## Disposition and gates
Do not create a duplicate staging blog row solely to force HTTP 200. The source-level 308 destination contract passed; the destination *runtime content* gate is **not exercised on staging**, due to known CMS separation. Do not report full six-path staging HTTP acceptance.

Before a production merge, independently verify production target /blog/spring-cleaning-checklist-cape-town returns 200 with correct canonical and visible checklist content (and that /quote and /services/standard-cleaning-cape-town remain 200). An isolated production-branch PR must carry only these bounded redirects and governance changes; main and production are divergent. After release, verify source 308, target 200, normal production indexability, booking/quote preservation, then reconcile/close only these three rows. If production target fails, do not promote the blog redirect.

No index submission, customer data modification, CMS content change, deployment or payment operation is authorized by this note.
