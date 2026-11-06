# FCO-01-C — Regular Cleaning simplified journey implementation contract

Status: DESIGN APPROVED / IMPLEMENTATION NOT STARTED
Recorded: 2026-11-05
Scope: Regular Cleaning only. Production and staging are not authorized for deployment.
Baseline production source: f0099fe51a96ed0eddb4b7447459baec365b6332

## Governance and release constraints
- Marketing Engineering owns funnel objectives and experiment acceptance, not unapproved modifications to pricing, payment or enterprise architecture.
- Isolate all work to feature/fco-01-regular-booking-simplification-20261105. No direct commits to production, main, deploy/staging or deploy/production.
- Feature flag defaults OFF for production. No migration, Supabase write, Paystack transaction, booking creation or financial change is authorized by design approval.
- Do not publish a staging or production bundle before isolated tests, CI and separate release approval.

## Approved customer journey
1. Your home: property type, bedrooms, bathrooms, extra rooms, pets, explicit equipment provider choice, optional extras, and suburb/service-area resolution.
2. Schedule: existing once-off/recurring choices, date, time, cleaner or team fulfillment and verified available slots.
3. Your details + review: complete street address, contact number, relevant access details; reconcile address and suburb, calculate equipment delivery if selected, and display authoritative final total.
4. Payment: retain existing server-side confirmation and Paystack safeguards. Stage 4 is not part of the three information-entry stages.

## Preserve existing authority
- Reuse BookingV2Context, Step2Schedule, the existing form state and URL step compatibility; avoid creating an independent booking engine.
- Split the existing step1Schema check into an earlier home-scope gate and deferred final-details gate, while preserving all full data validation before payment and booking confirmation.
- Reuse useBookingV2Pricing's quoteLock invalidation and authoritative /api/booking-v2/quote response.
- Use resolved serviceAreaLocationId for /api/booking/time-slots; never assume suburb text is enough.
- Preserve selected time eligibility, cleaner/team capacity, recurring schedule rules and any changes requiring refreshed availability.
- Preserve pendingBookingId, payment retry, reprice and abandoned pending-payment handling.

## Equipment — mandatory decision contract
- Regular Cleaning policy: customer provides supplies/equipment OR Shalean brings equipment for a logistics fee. Neither answer is silently preselected for new bookings.
- equipmentRequired remains yes/no and equipmentQuote remains unchanged in the persisted model.
- Current /api/booking-v2/equipment-quote requires full street address + suburb. Collect equipment preference at Home, but defer delivery fee resolution until Your details.
- If equipment is requested, do not present an unqualified final price before the address-based logistics quote. Show pricing pending as appropriate.
- A missing, invalid, geocode-failed, disabled or manual-quote-required equipment result must block automatic payment and direct the customer to the approved manual-quote path; never silently treat an unresolved logistics fee as zero.
- On address, selected suburb or equipment choice change, invalidate any old logistics quote and server quote lock, and reconfirm impacted slot/fulfillment inputs as necessary.
- Do not change default equipment price constants or approved business rules under this UX work package.

## User-experience contract
- Collapse five internal Regular Cleaning progressive sections into a responsive Home form. Keep clear labels, input errors, accessible focus, minimum touch targets and mobile 320px layout.
- Existing address saved/custom selection must remain available at the appropriate deferred details stage; do not place raw address or phone in telemetry.
- Continue must communicate why it cannot proceed, especially for incomplete room counts, unsupported suburb, pending equipment fee or price-unavailable state. A disabled control alone is insufficient feedback.
- Changing service to Deep, Moving, Carpet, Office or Airbnb must retain existing service-specific behavior.

## Analytics and conversion measurement
- Preserve historical canonical funnel stages and IDs; add versioned, Regular-only stage readiness and progression events.
- Track home viewed; home continue attempted; categorized validation blocking; schedule viewed/completed; details completed; equipment choice made and equipment quote outcome (without personal/location address details).
- Do not infer click attempts from disabled controls. Collect readiness transitions without logging raw addresses, phone numbers, codes or customer identifiers.
- Baseline: 286 Service sessions; 59 Schedule sessions; 20.6% progression over prior rolling 30 days. Segment comparisons must be adjusted for sample quality and bot/repeated-session artifacts.
- Compare paid-booking conversion, not only Service-to-Schedule movement.

## Proposed isolated implementation slices
C1: Add flag, stage contracts and route-safe presentation adapter (production OFF).
C2: Build Home UI, with stage-specific readiness and suburb resolution.
C3: Reuse Schedule with previous authoritative availability gates.
C4: Defer address/contact and equipment quote to Your details; preserve server confirmation.
C5: Add versioned privacy-safe events, error classification and reporting.
C6: Regression and non-mutating browser smoke; draft PR to production (not merged), explicit owner review.

## Acceptance gates
- Unit tests: Home fields, zero vs unanswered extra rooms, pets/equipment explicit choice, required/optional extras, unsupported suburb.
- Security/financial tests: no unquoted equipment fee, no stale quote lock, pending booking recovery, idempotent payment, recurring and cleaner capacity.
- Device tests: desktop and mobile widths (320px, 375px, 768px, 1440px), keyboard navigation and visible blocked reason.
- No real customer account creation, live booking, analytics INSERT, messaging or provider charges during smoke tests.
- CI: critical tests, booking-core lint, typecheck, Next Webpack build, relevant permissions tests.
- Staging requires explicit source/activation authorization; production requires separate acceptance.

## Open implementation decisions
- Server-backed equipment manual quote escalation UX must be designed, using existing approved customer-support path rather than inventing a payment bypass.
- Whether live availability is displayed before exact equipment logistics is confirmed must be tested to ensure no promise of a slot that cannot be fulfilled.
- Historical sessions lack internal substage telemetry; treat pre-release step split as unknown rather than backfilling guesses.
