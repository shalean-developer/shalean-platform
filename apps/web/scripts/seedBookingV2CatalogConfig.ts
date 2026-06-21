/**
 * Merges booking_v2 catalog config into pricing_booking_config (id=default).
 * Run: npx tsx scripts/seedBookingV2CatalogConfig.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { buildDefaultBookingV2CatalogConfig } from "@/lib/booking-v2/bookingV2ServiceDefinitions";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const seedPath = resolve(__dirname, "../../../supabase/seeds/booking_v2_catalog_config.json");
  let bookingV2: unknown;
  try {
    bookingV2 = JSON.parse(readFileSync(seedPath, "utf8"));
  } catch {
    bookingV2 = buildDefaultBookingV2CatalogConfig();
  }

  const { data: row, error: readErr } = await admin
    .from("pricing_booking_config")
    .select("config")
    .eq("id", "default")
    .maybeSingle();

  if (readErr) {
    console.error("Read failed:", readErr.message);
    process.exit(1);
  }

  const existing = (row?.config as Record<string, unknown> | null) ?? {};
  const next = { ...existing, booking_v2: bookingV2 };

  const { error: writeErr } = await admin
    .from("pricing_booking_config")
    .upsert({ id: "default", config: next, updated_at: new Date().toISOString() });

  if (writeErr) {
    console.error("Write failed:", writeErr.message);
    process.exit(1);
  }

  console.log("Seeded pricing_booking_config.config.booking_v2");
}

main();
