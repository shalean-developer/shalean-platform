# FCO-01-C4 — Equipment receipt cross-session isolation

Status: SOURCE AND REGRESSION TESTS COMMITTED; LATEST-HEAD CI AND BROWSER ACCEPTANCE PENDING

## Threat and bounded policy
Before this change the receipt authenticated amount/address/policy/expiry, but could be copied to another browser for the *same* delivery address. This work adds a short-lived HttpOnly SameSite=Lax browser-session cookie authenticated with a domain-separated server HMAC; its SHA-256 domain-separated digest is part of the separate HMAC-signed equipment receipt. Quote signing and booking confirmation must present the issuing cookie; a receipt alone is insufficient.

The receipt is **not** one-time use. It may be reused by the issuing browser until it expires (currently 10 minutes) to allow quote refresh and pre-booking retry; the customer quote lock remains separately validated. Once a `pendingBookingId` has been created, the existing payment-session recovery route is authoritative and must be tested independently; the receipt does not replace that idempotency contract.

## Test cases added on draft PR #1083
- Receipt validation: same address but changed session digest is rejected; a fabricated or altered cookie is rejected before verification.
- Server authorization: missing or mismatched session rejects; correct session passes.
- HTTP equipment quote: the issuer sets the protected session cookie, quote verifies it, and another cookie at the same address fails to create a quote lock.
- HTTP booking confirm: a valid signed receipt with the wrong browser cookie rejects before financial quote generation or booking writes.
- Previous missing, forged, altered-fee, changed-address, expiry, manual-quote and pricing revision cases remain in the required critical CI suite.

## Known limitations / future verification
- A browser-session cookie is a bearer capability, **not identity authentication**. It is now cryptographically authenticated to reject caller-chosen cookie values, but theft of both the receipt and an authentic session cookie, or reuse within the same browser, remains outside the protection of this short-lived binding. Confirm the cookie's browser behavior and security policy during isolated acceptance.
- Confirm real-browser SameSite/Secure/Path and Set-Cookie behavior in an isolated environment. Preview artifacts are not Plesk deployment authorization.
- Refreshing a receipt after ten minutes may require a new equipment-quote call and refreshed overall quote lock; test customer-visible recovery without double-booking.
- Verify existing pending-payment retry resumes from the stored pending booking rather than trying to generate a new receipt/confirm, and editing a pending booking safely supersedes old payment state.
- Prove server and browser feature flags agree; production must remain hard-blocked.

## Operational acceptance
No production code, Plesk setting, Supabase booking, analytics record, or Paystack transaction is authorized to change. Keep PR #1083 Draft and unmerged. C4-BLOCK-01 remains open until exact-head tests and non-mutating mobile/desktop browser acceptance succeed.
