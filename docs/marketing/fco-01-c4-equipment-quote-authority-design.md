# FCO-01-C4-BLOCK-01 — Server-authoritative equipment quote design

Status: DESIGN + PURE REGRESSION CONTRACT IMPLEMENTED; BACKEND ENFORCEMENT NOT IMPLEMENTED
Scope: isolated draft PR #1083, no merge, activation, provider requests or database writes.
Owner boundary: Software Engineering owns implementation, Finance approves pricing authority and edge cases, Marketing Engineering owns conversion requirements.

## Evidence

Current `/api/booking-v2/equipment-quote` accepts street address and suburb, loads equipment policy and calculates distance-based logistics on the server. It returns an unsigned equipment quote.

Current `/api/booking-v2/quote` accepts client-supplied `equipmentQuote`, builds a signed customer total and returns an existing quote lock; `/api/booking-v2/confirm` consumes client `equipmentQuote` when recalculating locked totals. Thus, signature validity of an *overall* amount does not prove the equipment fee originated from an authoritative address-based calculation.

The staging-only simplified journey postpones full address until Your Details, making stale address-dependent fees a release-critical risk.

## Selected architecture: signed server-issued logistics receipt + existing quote lock

1. Customer explicitly chooses equipment at Home; if customer-provided, equipment fee is 0 and no delivery receipt is required.
2. When Shalean equipment is requested and the customer provides a complete address at Your Details, the existing equipment-quote service computes the distance and logistics fee on the server, using the active configuration. The issuer must use only that computed result.
3. A server-only receipt signer creates a short-lived HMAC-SHA256 token with domain-separated purpose, exact normalized-address digest, component amounts, distance, pricing-policy revision, issue and expiry times. The token never includes a plaintext address or access code.
4. Client receives the logistics display breakdown and the opaque receipt. It may display the values but cannot set the authoritative fee.
5. `POST /api/booking-v2/quote` must verify the receipt against request address, amount and expiry, resolve the server-validated fee from the signed payload, and build the existing *separate* customer quote signature over authoritative inputs. On mismatch, reject the quote rather than signing untrusted equipment data.
6. `POST /api/booking-v2/confirm` must verify the receipt again using the final submitted address and fee, then preserve existing locked pricing-version checks, quote signature, quote expiry, availability, eligibility, idempotency and pending-payment protections. A changed address, fee or equipment choice must require a fresh logistics receipt and customer quote lock.
7. A manual-quote-required result, unavailable equipment delivery, geocode failure, unresolved distance or absent receipt blocks automatic payment. Route to an approved manual-quote/contact workflow, not a fabricated R0 fee.
8. Keep already-issued pending-payment snapshots frozen under existing recovery rules. For an edited pending booking, first perform the approved supersession boundary; request a new receipt and quote lock for the edited scope. Do not mutate existing paid invoices or payment records.

## Secret and migration rules

The primitive added in `apps/web/lib/booking-v2/equipmentQuoteAuthority.ts` takes an explicit secret and **has no production fallback**. An integration may derive a domain-separated key from the existing protected booking HMAC secret after security review, or use an approved dedicated secret; never expose it as a NEXT_PUBLIC variable. No secret rotation or configuration changes are authorized here.

There is **no schema migration** in this design. If backend wiring requires persisted receipt identifiers or price-version binding, approve that separately after migration and rollback review.

## Current isolated code

- `equipmentQuoteAuthority.ts`: testable server-only issuance/verification primitive; not called by routes.
- `equipmentQuoteAuthority.test.ts`: address change, normalization, tampering, wrong key, missing, expiry and manual-quote cases.
- C4 UI quote lifecycle fixes: abort stale equipment requests, clear stale quote immediately, ensure no wrapper double reset.
- C4 deep-link guard: incomplete Home, Schedule, or Your Details sends the user to the earliest required stage.

## Integration work still required

- Define quote receipt transport and schema, including server-only config version semantics and binding to a booking/session scope to prevent cross-session replay.
- Issue receipt only from a server-computed quote, not arbitrary request-supplied fee or distance.
- Wire mandatory verification into both quote and confirm routes, preserving original behavior outside the explicitly approved rollout boundary.
- Ensure server checks also cover a fee of zero, unavailable equipment, a manual quote, changed postal code, house number and unit number.
- Validate equipment fee against active policy/revision and the existing locked quote; do not silently reprice accepted pending payments.
- Add route-level negative tests for missing, swapped, expired, tampered, stale and replayed receipts, plus quote/confirm integration and payment idempotency tests.
- Run isolated desktop/mobile booking smoke with POST/mutation interception. Do not contact live Paystack or write a booking.

## Acceptance decision

**BLOCKED** until backend issuance and both route checks are integrated, C4 financial regression tests pass, and the isolated browser flows are verified. Passing pure receipt tests is not evidence that the production quote/confirm routes enforce them.

Do not merge PR #1083, enable the flag in production or activate any staging/preview bundle under this design-only approval.
