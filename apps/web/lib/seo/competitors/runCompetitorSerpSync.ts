import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSerpProvider } from "@/lib/seo/competitors/serpProvider";

type KeywordRow = {
  id: string;
  keyword: string;
  location_name: string;
  language_code: string;
  device: "desktop" | "mobile";
};

type CompetitorRow = { id: string; domain: string };

const SHALEAN_DOMAIN = "shalean.co.za";

export async function runCompetitorSerpSync(admin: SupabaseClient, limit = 50) {
  const provider = getSerpProvider();
  if (!provider) {
    return { ok: false, provider: null, keywordsProcessed: 0, snapshots: 0, rankings: 0, error: "SERP provider is not configured." };
  }

  const [{ data: keywords, error: keywordError }, { data: competitors, error: competitorError }] = await Promise.all([
    admin.from("seo_tracked_keywords").select("id,keyword,location_name,language_code,device").eq("active", true).order("priority", { ascending: true }).limit(limit),
    admin.from("seo_competitors").select("id,domain").eq("active", true).eq("ignored", false),
  ]);
  if (keywordError) return { ok: false, provider: provider.name, keywordsProcessed: 0, snapshots: 0, rankings: 0, error: keywordError.message };
  if (competitorError) return { ok: false, provider: provider.name, keywordsProcessed: 0, snapshots: 0, rankings: 0, error: competitorError.message };

  const competitorByDomain = new Map(((competitors ?? []) as CompetitorRow[]).map((row) => [row.domain, row.id]));
  let snapshots = 0;
  let rankings = 0;
  const errors: string[] = [];

  for (const keyword of (keywords ?? []) as KeywordRow[]) {
    try {
      const result = await provider.search({ keyword: keyword.keyword, locationName: keyword.location_name, languageCode: keyword.language_code, device: keyword.device });
      const { data: snapshot, error: snapshotError } = await admin.from("seo_serp_snapshots").insert({
        keyword_id: keyword.id,
        provider: result.provider,
        result_count: result.items.length,
        raw: result.raw,
      }).select("id").single();
      if (snapshotError || !snapshot) throw new Error(snapshotError?.message || "Could not create SERP snapshot.");
      snapshots += 1;

      const rows = result.items.map((item) => ({
        snapshot_id: snapshot.id,
        keyword_id: keyword.id,
        competitor_id: competitorByDomain.get(item.domain) ?? null,
        domain: item.domain,
        position: item.position,
        result_type: item.type,
        url: item.url,
        title: item.title,
        is_shalean: item.domain === SHALEAN_DOMAIN || item.domain.endsWith(`.${SHALEAN_DOMAIN}`),
      }));
      if (rows.length) {
        const { error: rankError } = await admin.from("seo_competitor_rankings").insert(rows);
        if (rankError) throw new Error(rankError.message);
        rankings += rows.length;
      }
    } catch (error) {
      errors.push(`${keyword.keyword}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return {
    ok: errors.length === 0,
    provider: provider.name,
    keywordsProcessed: (keywords ?? []).length,
    snapshots,
    rankings,
    errors,
  };
}
