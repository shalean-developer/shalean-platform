import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readGscCredentials } from "@/lib/gsc/gsc-config";
import { SITE_ORIGIN } from "@/lib/site/canonical";

type Existing = { state:string; coverage_state:string|null };

function classifyPath(path:string): { pageGroup:string; priority:"p0"|"p1"|"p2" } {
  if (path === "/" || path.startsWith("/services/")) return { pageGroup:path === "/" ? "core" : "service", priority:"p0" };
  if (path.startsWith("/locations/") || path.startsWith("/blog/")) return { pageGroup:path.startsWith("/blog/") ? "blog" : "location", priority:"p1" };
  if (path.startsWith("/cleaner/")) return { pageGroup:"recruitment", priority:"p1" };
  return { pageGroup:"core", priority:"p1" };
}

function parseLocs(xml:string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m)=>m[1].replace(/&amp;/g,"&").trim()).filter(Boolean);
}

async function readCanonicalSitemapUrls(): Promise<string[]> {
  const root = `${SITE_ORIGIN}/sitemap.xml`;
  const response = await fetch(root, { cache:"no-store" });
  if (!response.ok) throw new Error(`Sitemap fetch failed (${response.status}).`);
  const xml = await response.text();
  const locs = parseLocs(xml);
  const childSitemaps = locs.filter((url)=>url.endsWith(".xml"));
  const urls = locs.filter((url)=>!url.endsWith(".xml"));
  for (const child of childSitemaps.slice(0, 20)) {
    const childResponse = await fetch(child, { cache:"no-store" });
    if (!childResponse.ok) continue;
    urls.push(...parseLocs(await childResponse.text()).filter((url)=>!url.endsWith(".xml")));
  }
  return [...new Set(urls)].filter((url)=>url.startsWith(SITE_ORIGIN));
}

function normalizeState(indexStatus:any): "indexed"|"not_indexed"|"excluded"|"blocked"|"unknown" {
  const robots = String(indexStatus?.robotsTxtState ?? "").toUpperCase();
  const indexing = String(indexStatus?.indexingState ?? "").toUpperCase();
  const coverage = String(indexStatus?.coverageState ?? "").toLowerCase();
  const verdict = String(indexStatus?.verdict ?? "").toUpperCase();
  if (robots.includes("BLOCKED") || indexing.includes("BLOCKED") || coverage.includes("blocked")) return "blocked";
  if (verdict === "PASS") return "indexed";
  if (coverage.includes("excluded") || coverage.includes("duplicate") || coverage.includes("alternate")) return "excluded";
  if (coverage || verdict === "FAIL" || verdict === "NEUTRAL") return "not_indexed";
  return "unknown";
}

function reasonFor(indexStatus:any, state:string): string {
  return String(indexStatus?.coverageState || indexStatus?.pageFetchState || indexStatus?.indexingState || (state === "indexed" ? "Indexed" : "Index status unavailable"));
}

export async function runIndexingSync(admin: SupabaseClient, limit = 400) {
  const credentials = readGscCredentials();
  if (!credentials) return { ok:false, error:"Google Search Console is not configured." };
  const urls = (await readCanonicalSitemapUrls()).slice(0, Math.min(Math.max(limit,1), 1900));
  const { data:run, error:runError } = await admin.from("seo_indexing_runs").insert({ sitemap_urls:urls.length }).select("id").single();
  if (runError || !run) throw new Error(runError?.message || "Could not create indexing run.");

  const auth = new google.auth.JWT({ email:credentials.clientEmail, key:credentials.privateKey, scopes:["https://www.googleapis.com/auth/webmasters.readonly"] });
  const client = google.searchconsole({ version:"v1", auth });
  const { data:existingRows } = await admin.from("seo_indexing_states").select("url,state,coverage_state").in("url", urls);
  const existing = new Map<string,Existing>((existingRows ?? []).map((row:any)=>[row.url,{ state:row.state, coverage_state:row.coverage_state }]));

  let inspected=0,indexed=0,notIndexed=0,excluded=0,blocked=0,regressions=0,errors=0;
  for (const url of urls) {
    try {
      const res = await client.urlInspection.index.inspect({ requestBody:{ inspectionUrl:url, siteUrl:credentials.siteUrl, languageCode:"en-US" } });
      const result:any = res.data.inspectionResult ?? {};
      const status:any = result.indexStatusResult ?? {};
      const state = normalizeState(status);
      const previous = existing.get(url);
      const regression = previous?.state === "indexed" && state !== "indexed";
      const path = new URL(url).pathname || "/";
      const meta = classifyPath(path);
      const actionRequired = meta.priority === "p0" ? state !== "indexed" : regression || state === "blocked";
      const row = {
        url,path,page_group:meta.pageGroup,priority:meta.priority,in_sitemap:true,state,
        verdict:status.verdict ?? null,coverage_state:status.coverageState ?? null,robots_txt_state:status.robotsTxtState ?? null,
        indexing_state:status.indexingState ?? null,page_fetch_state:status.pageFetchState ?? null,
        google_canonical:status.googleCanonical ?? null,user_canonical:status.userCanonical ?? null,last_crawl_time:status.lastCrawlTime ?? null,
        inspected_at:new Date().toISOString(),previous_state:previous?.state ?? null,previous_coverage_state:previous?.coverage_state ?? null,
        regression_detected:regression,action_required:actionRequired,reason:reasonFor(status,state),raw:result,updated_at:new Date().toISOString(),
      };
      const { error } = await admin.from("seo_indexing_states").upsert(row,{ onConflict:"url" });
      if (error) throw new Error(error.message);
      inspected++;
      if (state === "indexed") indexed++; else if (state === "excluded") excluded++; else if (state === "blocked") blocked++; else notIndexed++;
      if (regression) regressions++;
    } catch (error) {
      errors++;
      console.error("[seo-indexing] inspect failed", url, error instanceof Error ? error.message : error);
    }
  }

  await admin.from("seo_indexing_states").update({ in_sitemap:false, updated_at:new Date().toISOString() }).eq("in_sitemap",true).not("url","in",`(${urls.map((u)=>`\"${u.replace(/\"/g,'')}\"`).join(",")})`);
  const status = errors === 0 ? "success" : inspected > 0 ? "partial" : "error";
  await admin.from("seo_indexing_runs").update({ completed_at:new Date().toISOString(),status,inspected,indexed,not_indexed:notIndexed,excluded,blocked,regressions,errors,message:errors?`${errors} URL inspections failed.`:"Indexing sync completed." }).eq("id",run.id);
  return { ok:status !== "error", runId:run.id, sitemapUrls:urls.length, inspected,indexed,notIndexed,excluded,blocked,regressions,errors };
}
