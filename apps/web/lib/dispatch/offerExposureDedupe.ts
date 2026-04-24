import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * At-most-once claim for emitting `dispatch.offer.exposed`.
 *
 * 1) If `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set: Redis `SET key 1 NX EX 300`.
 * 2) Else: Postgres insert into `dispatch_offer_exposure_dedupe` (PK = offer_id, permanent per offer).
 */
export async function claimOfferExposureDedupe(supabase: SupabaseClient, offerId: string): Promise<boolean> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (baseUrl && token) {
    try {
      const key = `offer_exposed:${offerId}`;
      const url = `${baseUrl}/set/${encodeURIComponent(key)}/1/NX/EX/300`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { result?: unknown };
      if (data.result === "OK") return true;
      if (data.result == null) return false;
    } catch {
      /* fall through to Postgres */
    }
  }

  const { error } = await supabase.from("dispatch_offer_exposure_dedupe").insert({ offer_id: offerId });
  if (!error) return true;
  if (error.code === "23505") return false;
  return false;
}
