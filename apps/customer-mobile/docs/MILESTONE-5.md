# Milestone 5 — Booking wizard

## What shipped

- Native booking funnel against existing `/api/booking-v2/*` + promotions/referrals validate
- Service catalog on `/(tabs)/book` → stack `/book/[slug]/{details,schedule,review,checkout}` → `/book/success`
- Live catalog pricing display (mirror of web totals: base + property factors + extras + extra cleaner + equipment logistics + service fee + recurring discount). Duration uses `estimatedDurationHours * 60`. No HMAC.
- Confirm payload matches web `bookingV2ConfirmSchema` (booleans → yes/no)
- Draft persistence: AsyncStorage `shalean.customer.booking-v2.v1`
- Optional stored referral: `shalean.customer.referral_code`
- After confirm: navigate to `/book/pay` with `bookingId`, `paystackReference`, `payAmountZar`, `email` (payment in M6)

## Screens

| Route | Role |
|-------|------|
| `/(tabs)/book` | Active service cards from GET services |
| `/book/[slug]/details` | Step 1 questions, address + resolve-location, extras, equipment-quote |
| `/book/[slug]/schedule` | Once-off/recurring, date chips (21d), morning slots, team/cleaners |
| `/book/[slug]/review` | Summary + price breakdown + edit links |
| `/book/[slug]/checkout` | Auto promo, promo code, referral, cleaning credit, Confirm → pay |
| `/book/pay` | Paystack Inline (M6) |
| `/book/success` | Verify / finalize phases (M6) |

## APIs used

- `getBookingV2Api()`: services, resolveLocation, availableCleaners, teamAvailability, equipmentQuote, confirm
- `getPromotionsApi().validate`
- `getReferralsApi().validateCheckout`, `.credit`

## Contract tests

```bash
cd apps/customer-mobile
npm run test:booking
```

## Manual QA

- [ ] Book tab lists active services with “from” price
- [ ] Details: required questions, address, phone, suburb resolves to location id
- [ ] Equipment yes triggers equipment-quote when address ready (regular only if flagged)
- [ ] Schedule: date chips + morning slots respect lead time; team OR cleaners load
- [ ] Review shows summary; edit links return to prior steps
- [ ] Checkout: auto promo / manual code / credit toggle; Confirm creates booking
- [ ] Success shows bookingId + payAmountZar; navigates to bookings
- [ ] Draft survives app backgrounding mid-wizard
- [ ] Soft price estimate may differ slightly from server — trust payAmountZar
- [ ] `npm run typecheck` and `npm run test:booking` pass

## Not in this milestone

- Paystack / mark paid — **done in M6**
- Booking detail / track (M7–M8)
- Invoice pay deep links (M9)
