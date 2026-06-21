import { writeFileSync } from "fs";
import { resolve } from "path";
import { buildDefaultBookingV2CatalogConfig } from "../lib/booking-v2/bookingV2ServiceDefinitions";

const payload = JSON.stringify({ booking_v2: buildDefaultBookingV2CatalogConfig() });
const escaped = payload.replace(/'/g, "''");

const sql = `-- Seed booking_v2 service catalog into pricing_booking_config (only when missing).
UPDATE public.pricing_booking_config
SET
  config = config || '${escaped}'::jsonb,
  updated_at = now()
WHERE id = 'default'
  AND NOT (config ? 'booking_v2');
`;

const out = resolve(__dirname, "../../../supabase/migrations/20261022_pricing_booking_v2_catalog_config.sql");
writeFileSync(out, sql, "utf8");
console.log("Wrote", out);
