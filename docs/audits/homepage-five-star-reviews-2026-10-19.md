# Homepage five-star review publishing

User-approved scope: homepage testimonials from five-star database reviews, anonymous attribution, permission wording, publishing controls, private data boundaries and unchanged Google/overall rating calculations.

## Behavior

- The homepage streams up to six approved, visible, non-empty five-star comments, newest first, from completed non-seed bookings.
- Attribution is always “Verified customer”. The public DTO contains review ID, stars, comment and review date only. Comments render as escaped plain text.
- The section is omitted when no eligible publications exist or the read is unavailable. Request-time rendering prevents build-time empty data or cached moderation state from persisting.
- Existing location-page and cleaner-profile comments also require customer display consent and use anonymous attribution. Aggregate star ratings remain based on all non-hidden ratings.
- New web submissions have an unchecked optional anonymous-publication permission checkbox. Other clients remain compatible and default to no consent.
- Office reviews exposes separate homepage approval/removal controls. Approval requires `content.publish`, an explicit permission/private-detail attestation and the exact comment the publisher reviewed. An atomic database function locks the review and refuses stale text.
- Customers can withdraw or restore anonymous display permission in Account → Reviews at any time, independently of the 24-hour text-edit window. Withdrawal removes homepage approval and prevents public comment feeds from returning the text. Office-confirmed permission updates this same customer-visible preference.
- Permission is recorded as customer opt-in or Office-confirmed permission; approver and time are retained privately. Existing reviews are not automatically approved or backfilled.
- Editing comment/rating/consent/ownership or changing Hide/Unhide removes approval. A booking must still be completed when the homepage reads it.
- Review, Google rating and aggregate-stat records are not rewritten.

## Security and validation

The publication table is RLS protected with service-role-only privileges. Both RPCs are invoker functions restricted to the service role. The trigger-only definer function has an empty search path and no public/anonymous/authenticated execute grant. The existing reviews RLS is unchanged.

Validation includes the critical suite, focused review/API/render tests, web TypeScript, enforced booking-core lint, and isolated PostgreSQL tests using the actual migration: approval eligibility, safe projection, stale text, role denial, edit/hide revocation and cancelled-booking suppression. CI runs the isolated test in its existing PGlite harness.

## Rollout and rollback

Apply the additive migration to staging before deploying the code. Verify roles and the empty unapproved feed; use synthetic isolated tests for approval behavior. Do not publish existing customer comments without an authorized publisher confirming permission and reviewing their contents.

After clean independent review and CI, apply the migration to staging, deploy main to canonical staging, then verify its live SHA and Office/public UI. For production, apply and verify the same additive migration BEFORE merging the bounded production promotion. Only then build/activate production and verify its live SHA and Office/public UI. Never trigger deployment workflows manually. Existing hosting authentication is required for activation if automatic deployment does not complete.

Rollback: remove a publication in Office to remove its card. Revert the code if needed; keep the additive schema and review data intact. No destructive rollback or financial mutation is required.
