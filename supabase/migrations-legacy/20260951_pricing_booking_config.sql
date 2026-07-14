-- Booking-v2 fee/discount/property-factor config (admin-editable JSONB).

CREATE TABLE IF NOT EXISTS public.pricing_booking_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pricing_booking_config IS
  'Booking-v2 platform fees, recurring discounts, and property-factor surcharge tables (ZAR integers / percents).';

ALTER TABLE public.pricing_booking_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.pricing_booking_config (id, config)
VALUES (
  'default',
  '{
    "service_fee_rule": "flat",
    "service_fee_flat_cents": 3000,
    "service_fee_percent": 5,
    "recurring_discounts": {
      "weekly": { "type": "percent", "value": 10 },
      "fortnightly": { "type": "percent", "value": 5 },
      "monthly": { "type": "percent", "value": 0 },
      "custom": { "type": "percent", "value": 0 }
    },
    "property_factor_rates": {
      "propertyType": {
        "house": 0,
        "apartment": 0,
        "townhouse": 0
      },
      "officeSize": {
        "small": 0,
        "medium": 50,
        "large": 120,
        "enterprise": 250
      },
      "lastCleaned": {
        "never": 100,
        "6_months_plus": 80,
        "3_6_months": 40,
        "1_3_months": 0
      },
      "furnished": {
        "yes": 50,
        "no": 0
      },
      "carpetType": {
        "standard": 0,
        "thick_pile": 50,
        "berber": 30,
        "persian_rug": 80
      },
      "stains": {
        "yes": 80,
        "no": 0
      },
      "carpetRooms_per_room_zar": 0
    },
    "supplies_equipment_cost_zar": 150
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Top-level booking columns for v2 pricing summary fields
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS recurring_discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes integer;

COMMENT ON COLUMN public.bookings.recurring_discount_cents IS
  'Recurring plan discount applied at booking-v2 checkout (cents).';

COMMENT ON COLUMN public.bookings.estimated_duration_minutes IS
  'Estimated job duration in minutes at booking-v2 confirm time.';
