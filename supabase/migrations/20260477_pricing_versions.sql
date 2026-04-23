-- Frozen pricing catalogs for checkout parity (locks reference a row, never live admin tables).
-- Cleanup: periodically DELETE FROM pricing_versions WHERE created_at < now() - interval '60 days'
--   and no booking references (see bookings.pricing_version_id).

CREATE TABLE IF NOT EXISTS public.pricing_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  code_version INTEGER NOT NULL,
  services JSONB NOT NULL,
  extras JSONB NOT NULL,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS pricing_versions_created_at_idx ON public.pricing_versions (created_at DESC);

COMMENT ON TABLE public.pricing_versions IS 'Immutable ZAR catalog snapshots; checkout recomputes from this row, not live code.';
COMMENT ON COLUMN public.pricing_versions.code_version IS 'Engine tariff marker (PRICING_CONFIG.version) at snapshot time.';
COMMENT ON COLUMN public.pricing_versions.rules IS 'e.g. { "bundles": [...] } — must match extras bundle engine.';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pricing_version_id UUID REFERENCES public.pricing_versions (id),
  ADD COLUMN IF NOT EXISTS price_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS bookings_pricing_version_id_idx ON public.bookings (pricing_version_id);

ALTER TABLE public.pricing_versions ENABLE ROW LEVEL SECURITY;
