# SEO-023 — Organic Conversion & Revenue

## Canonical attribution model

SEO-023 reuses the existing `user_events` analytics truth model and persisted `bookings` revenue rather than creating a parallel analytics warehouse.

Organic traffic is counted only when the session has an explicit organic/SEO attribution signal, `utm_medium=organic`, or a recognized search-engine source without a paid medium. Sessions with no UTM/source/attribution signal remain **unattributed** and are not silently classified as organic.

Completed organic sessions are correlated to persisted bookings through `booking_id` / `bookingId` in analytics payloads. Revenue uses `bookings.amount_paid` when available and falls back to `bookings.total_amount`; a booking with no positive persisted amount contributes zero attributable revenue.

Keyword-cluster business value is joined through the SEO-022 canonical keyword portfolio (`seo_tracked_keywords.target_path`) and GSC page metrics (`site_gsc_metrics`). This is page/cluster attribution, not query-level last-click attribution: Search Console queries are visibility signals and are not claimed as the causal source of a specific booking.
