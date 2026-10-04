# RD-P06H — Support surfaces

Status: IMPLEMENTED — VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06h-base` @ `70eebb62201be55ba634efd27fbde2aea24ea365`
Scope: presentation-only normalization of customer support surfaces. No production deployment, support-case mutation, Supabase mutation, Auth/RBAC change, booking/payment mutation, customer ownership change, SLA/status authority change, or support-destination change is authorized.

## Programme authority

RD-P06A defines `/account/help`, `/account/cases`, and account-side support/action presentation as the final implementation slice before the RD-P06 closure audit. RD-P06H may normalize Help/FAQ/search/contact and formal case presentation, including status/timing/action hierarchy, while preserving support APIs, case data and support destinations.

## Runtime scope

- `apps/web/app/(ui-redesign)/account/help/page.tsx`
- `apps/web/app/(ui-redesign)/account/cases/page.tsx`
- `apps/web/components/account/HelpCard.tsx`

No API, hook, database, auth, booking, billing, or support-domain file is in scope.

## Preserved support authority

The implementation intentionally preserves:

- `/api/customer/cases` as the customer case read contract;
- `getSupabaseAccessToken()` and the existing bearer-token request flow;
- case ownership and the full case payload returned by the API;
- case `status`, `category`, `priority`, first-response timestamps, resolution timestamps, resolution summary, booking association, created/updated timestamps and case number;
- the existing open-case count rule (`resolved` and `closed` are not open);
- the existing related-booking destination `/account/bookings/[booking_id]`;
- all Help/FAQ copy and search matching semantics;
- WhatsApp destination `27825915525`, including the existing urgent-booking prefilled message;
- `hello@shalean.co.za` email destination;
- `+27825915525` telephone destination;
- `/account/book` booking CTA destination;
- AccountShell/AccountNav/customer role guard.

No support case is created, updated, resolved, closed, escalated, reassigned, or otherwise mutated by RD-P06H.

## Presentation normalization

### Help / FAQ

- shared `Card`, `Button`, `Input`, semantic tokens and canonical focus presentation replace route-local gray/blue/red/green chrome;
- search now has an explicit accessible label while retaining the same matching behavior;
- urgent support remains the same WhatsApp destination but uses semantic destructive presentation and responsive action containment;
- WhatsApp/email/phone cards retain the exact destinations and service text while using shared card hierarchy;
- FAQ category controls use shared Button variants and `aria-pressed` state;
- FAQ disclosure controls add `aria-expanded` / `aria-controls` and visible keyboard focus while retaining the same local open/close behavior;
- empty-search and Book-a-clean CTAs use shared card/action presentation.

### Support cases

- shared `Badge` variants map existing case status strings to semantic presentation only;
- header/Refresh action, case counters, loading skeletons, error/retry state, empty state and populated case cards use shared presentation roles;
- case title/category/opened timestamp remain unchanged;
- first-response and resolution timing values are unchanged and are only reorganized visually;
- resolution summaries retain the API text and receive semantic success presentation;
- related-booking action retains the exact existing destination;
- mobile action/card wrapping is normalized without changing data or API behavior.

### Shared HelpCard

- shared `Card`/`Button` primitives and semantic success tokens replace route-local green chrome;
- compact and regular variants retain their existing text, WhatsApp number and destination.

## Explicitly not changed

- support-case API implementation or query filters;
- case ownership/RLS/security behavior;
- case SLA calculation, due timestamps, priority, category or status semantics;
- support-case creation/update workflow;
- notification or escalation behavior;
- support phone/email/WhatsApp destinations;
- FAQ wording/business-policy authority;
- AccountShell/AccountNav/auth/session behavior;
- any production or Supabase data/configuration.

## Validation gates

RD-P06H requires:

1. exact-head `web-test` success;
2. exact-head `migration-governance` success;
3. desktop/mobile `/account/help` smoke including search, category filters and at least one FAQ disclosure;
4. desktop/mobile `/account/cases` smoke for the available local state (empty or populated);
5. if populated cases exist, verify status badge, timing blocks, resolution summary when available and related-booking action containment;
6. keyboard/focus/label/disclosure semantics remain present;
7. no support-case mutation, production deployment, Supabase mutation, booking/payment mutation or Auth/RBAC change during validation.

A validation-only PR must be closed unmerged after exact-head CI and local visual approval.
