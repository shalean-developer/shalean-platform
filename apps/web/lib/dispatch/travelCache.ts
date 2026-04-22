import type { SupabaseClient } from "@supabase/supabase-js";
import type { LatLng, TravelTimeProvider } from "@/lib/dispatch/travelProviderTypes";

function ttlMs(): number {
  return (10 + Math.random() * 20) * 60_000;
}

/**
 * Route cache: area id pairs → minutes. Falls back to provider (Google / Haversine) on miss or expiry.
 */
export async function getTravelMinutesBetweenAreas(params: {
  supabase: SupabaseClient;
  originLocationId: string | null;
  destLocationId: string | null;
  origin: LatLng;
  destination: LatLng;
  inner: TravelTimeProvider;
}): Promise<number> {
  const { supabase, originLocationId, destLocationId, origin, destination, inner } = params;
  const now = new Date();

  if (originLocationId && destLocationId) {
    const { data, error } = await supabase
      .from("travel_route_cache")
      .select("minutes, expires_at")
      .eq("origin_location_id", originLocationId)
      .eq("dest_location_id", destLocationId)
      .maybeSingle();

    if (!error && data && typeof data === "object") {
      const exp = (data as { expires_at?: string }).expires_at;
      const mins = Number((data as { minutes?: unknown }).minutes);
      if (exp && new Date(exp) > now && Number.isFinite(mins) && mins >= 0) {
        return mins;
      }
    }

    const minutes = await inner.getTravelTimeMinutes({ origin, destination });
    const finiteMin = Number.isFinite(minutes) && minutes >= 0 ? minutes : 1;

    await supabase.from("travel_route_cache").upsert(
      {
        origin_location_id: originLocationId,
        dest_location_id: destLocationId,
        minutes: finiteMin,
        expires_at: new Date(Date.now() + ttlMs()).toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "origin_location_id,dest_location_id" },
    );
    return finiteMin;
  }

  return inner.getTravelTimeMinutes({ origin, destination });
}
