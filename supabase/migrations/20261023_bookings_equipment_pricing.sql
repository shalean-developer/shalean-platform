-- Equipment logistics fee: booking columns + default admin config.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS equipment_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipment_distance_km numeric(6,2),
  ADD COLUMN IF NOT EXISTS equipment_base_fee integer,
  ADD COLUMN IF NOT EXISTS equipment_price_per_km integer,
  ADD COLUMN IF NOT EXISTS equipment_distance_charge integer,
  ADD COLUMN IF NOT EXISTS equipment_logistics_fee integer,
  ADD COLUMN IF NOT EXISTS equipment_base_location text,
  ADD COLUMN IF NOT EXISTS manual_quote_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipment_pricing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS equipment_fee_override_reason text;

COMMENT ON COLUMN public.bookings.equipment_required IS
  'Customer or admin requested Shalean to bring cleaning equipment.';
COMMENT ON COLUMN public.bookings.equipment_distance_km IS
  'One-way distance (km) from equipment base to customer address at quote time.';
COMMENT ON COLUMN public.bookings.equipment_logistics_fee IS
  'Equipment delivery + collection fee (ZAR) charged on booking; 0 when manual quote required.';
COMMENT ON COLUMN public.bookings.equipment_pricing_snapshot IS
  'Frozen equipment pricing config and geocode metadata at booking time.';
COMMENT ON COLUMN public.bookings.equipment_fee_override_reason IS
  'Admin reason when equipment logistics fee was manually overridden.';

-- Seed default equipment pricing into pricing_booking_config (merge, do not overwrite existing).
UPDATE public.pricing_booking_config
SET config = config || jsonb_build_object(
  'equipment_pricing',
  COALESCE(
    config->'equipment_pricing',
    '{
      "is_active": true,
      "base_fee_zar": 450,
      "price_per_km_zar": 25,
      "max_auto_distance_km": 20,
      "base_address": "Shalean Equipment Base, Cape Town",
      "base_latitude": -33.9768,
      "base_longitude": 18.4686,
      "manual_quote_message": "Manual quote required for equipment delivery and collection."
    }'::jsonb
  )
),
updated_at = now()
WHERE id = 'default';
