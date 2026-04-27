import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Append-only feature rows for analytics / cold-start warm-up (call from cron or after key events). */
export async function upsertAiFeature(
  admin: SupabaseClient,
  row: {
    entity_type: "booking" | "cleaner" | "customer";
    entity_id: string;
    feature_key: string;
    feature_value: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("ai_feature_store").insert({
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    feature_key: row.feature_key,
    feature_value: row.feature_value,
  });
  if (error) console.warn("upsertAiFeature", error.message);
}

/** Customer: conversion proxy, LTV tier, segment — derived from existing growth tables when present. */
export async function syncCustomerAiFeatures(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: seg } = await admin.from("customer_segment").select("segment, city_id").eq("user_id", userId).maybeSingle();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("booking_count, total_spent_cents")
    .eq("id", userId)
    .maybeSingle();
  const n = Number((profile as { booking_count?: number } | null)?.booking_count ?? 0);
  const total = Number((profile as { total_spent_cents?: number } | null)?.total_spent_cents ?? 0);
  const conversion_proxy = n > 0 ? Math.min(1, n / 12) : 0.05;
  await upsertAiFeature(admin, {
    entity_type: "customer",
    entity_id: userId,
    feature_key: "customer.summary",
    feature_value: {
      segment: (seg as { segment?: string } | null)?.segment ?? "unknown",
      ltv_cents_sum: total,
      booking_count: n,
      conversion_proxy,
    },
  });
}

/** Cleaner: acceptance + workload snapshot. */
export async function syncCleanerAiFeatures(admin: SupabaseClient, cleanerId: string): Promise<void> {
  const { data: row } = await admin
    .from("cleaners")
    .select("acceptance_rate, acceptance_rate_recent, marketplace_outcome_ema, jobs_completed")
    .eq("id", cleanerId)
    .maybeSingle();
  const r = row as {
    acceptance_rate?: number | null;
    acceptance_rate_recent?: number | null;
    marketplace_outcome_ema?: number | null;
    jobs_completed?: number | null;
  } | null;
  await upsertAiFeature(admin, {
    entity_type: "cleaner",
    entity_id: cleanerId,
    feature_key: "cleaner.summary",
    feature_value: {
      acceptance_rate: r?.acceptance_rate ?? null,
      acceptance_rate_recent: r?.acceptance_rate_recent ?? null,
      outcome_ema: r?.marketplace_outcome_ema ?? null,
      jobs_completed: r?.jobs_completed ?? 0,
    },
  });
}

/** Booking: time / location / demand snapshot for learning. */
export async function syncBookingAiFeatures(
  admin: SupabaseClient,
  bookingId: string,
  slice: { date: string; time: string; location_id?: string | null; city_id?: string | null; demand?: string | null },
): Promise<void> {
  await upsertAiFeature(admin, {
    entity_type: "booking",
    entity_id: bookingId,
    feature_key: "booking.context",
    feature_value: {
      date: slice.date,
      time: slice.time,
      location_id: slice.location_id ?? null,
      city_id: slice.city_id ?? null,
      demand_level: slice.demand ?? null,
    },
  });
}
