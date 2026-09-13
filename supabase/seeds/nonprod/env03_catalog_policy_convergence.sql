-- ENV-03 catalogue policy convergence.
-- The active schema already provides pricing_services_select_active; keep one
-- permissive SELECT policy per role/action to avoid redundant RLS evaluation.

BEGIN;

DROP POLICY IF EXISTS pricing_services_select_public_nonprod
  ON public.pricing_services;

COMMIT;
