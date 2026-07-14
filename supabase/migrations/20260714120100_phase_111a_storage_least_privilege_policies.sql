-- Phase 1.11A — P0: Storage least-privilege policies for production buckets
-- Audit: F-SEC-003
--
-- App evidence (all Storage I/O via getSupabaseAdmin / service_role):
--   blog-media              public CDN read; admin API upload/remove
--   campaign-media          public CDN read; admin/GBP API upload/remove
--   booking-service-photos  private; cleaner QA API upload; signed URL read
--   expense-receipts        private; finance API upload/remove; signed URL read
-- No browser/mobile .storage.from clients. No upsert:true. No storage.update.
--
-- service_role bypasses RLS. Policies below explicitly deny anon/authenticated
-- Data API access while documenting intended model. Public CDN paths for
-- public buckets remain governed by storage.buckets.public = true.

BEGIN;

-- Ensure buckets exist (idempotent; baseline dump omitted storage buckets).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'blog-media',
    'blog-media',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'campaign-media',
    'campaign-media',
    true,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'booking-service-photos',
    'booking-service-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'expense-receipts',
    'expense-receipts',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop any prior policies with these names (idempotent re-apply).
DROP POLICY IF EXISTS "phase111a_deny_anon_auth_blog_media" ON storage.objects;
DROP POLICY IF EXISTS "phase111a_deny_anon_auth_campaign_media" ON storage.objects;
DROP POLICY IF EXISTS "phase111a_deny_anon_auth_booking_service_photos" ON storage.objects;
DROP POLICY IF EXISTS "phase111a_deny_anon_auth_expense_receipts" ON storage.objects;

-- Explicit deny for client roles on each bucket (INSERT/SELECT/UPDATE/DELETE).
-- USING (false) / WITH CHECK (false) = no rows/commands permitted for these roles.

-- Phase 1.11A: anon/authenticated cannot use Storage API for blog-media; uploads via service_role API. Public CDN uses buckets.public.
CREATE POLICY "phase111a_deny_anon_auth_blog_media"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'blog-media' AND false)
  WITH CHECK (bucket_id = 'blog-media' AND false);

-- Phase 1.11A: anon/authenticated cannot use Storage API for campaign-media; uploads via service_role API.
CREATE POLICY "phase111a_deny_anon_auth_campaign_media"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'campaign-media' AND false)
  WITH CHECK (bucket_id = 'campaign-media' AND false);

-- Phase 1.11A: private bucket; cleaner/admin uploads and signed reads via service_role only.
CREATE POLICY "phase111a_deny_anon_auth_booking_service_photos"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'booking-service-photos' AND false)
  WITH CHECK (bucket_id = 'booking-service-photos' AND false);

-- Phase 1.11A: private bucket; finance uploads/downloads via service_role only.
CREATE POLICY "phase111a_deny_anon_auth_expense_receipts"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'expense-receipts' AND false)
  WITH CHECK (bucket_id = 'expense-receipts' AND false);

COMMIT;
