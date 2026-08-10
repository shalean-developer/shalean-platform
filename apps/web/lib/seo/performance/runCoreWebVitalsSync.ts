type SupabaseAdmin = any;

type Device = "mobile" | "desktop";

function classify(lcp?: number|null, inp?: number|null, cls?: number|null) {
  if (lcp == null && inp == null && cls == null) return "unknown";
  const poor = (lcp != null && lcp > 4000) || (inp != null && inp > 500) || (cls != null && cls > 0.25);
  if (poor) return "poor";
  const ni = (lcp != null && lcp > 2500) || (inp != null && inp > 200) || (cls != null && cls > 0.1);
  return ni ? "needs_improvement" : "good";
}

function metric(metrics: any, key: string) {
  const value = metrics?.[key]?.percentile;
  return typeof value === "number" ? value : null;
}

export async function runCoreWebVitalsSync(admin: SupabaseAdmin, maxPages = 20) {
  const { data: pages, error } = await admin.from("seo_indexing_states")
    .select("url,path,page_group,priority").eq("in_sitemap", true)
    .in("priority", ["P0","P1"]).order("priority", { ascending: true }).limit(maxPages);
  if (error) throw new Error(error.message);

  const apiKey = process.env.PAGESPEED_API_KEY?.trim();
  let measured = 0, regressions = 0, failures = 0;

  for (const page of pages ?? []) {
    for (const device of ["mobile","desktop"] as Device[]) {
      try {
        const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
        endpoint.searchParams.set("url", page.url);
        endpoint.searchParams.set("strategy", device);
        endpoint.searchParams.set("category", "performance");
        if (apiKey) endpoint.searchParams.set("key", apiKey);
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(90000) });
        if (!response.ok) throw new Error(`PageSpeed ${response.status}`);
        const json: any = await response.json();
        const field = json.loadingExperience?.metrics ?? json.originLoadingExperience?.metrics ?? {};
        const fieldLcp = metric(field, "LARGEST_CONTENTFUL_PAINT_MS");
        const fieldInp = metric(field, "INTERACTION_TO_NEXT_PAINT");
        const fieldClsRaw = metric(field, "CUMULATIVE_LAYOUT_SHIFT_SCORE");
        const fieldCls = fieldClsRaw == null ? null : fieldClsRaw / 100;
        const audits = json.lighthouseResult?.audits ?? {};
        const labLcp = audits["largest-contentful-paint"]?.numericValue ?? null;
        const labCls = audits["cumulative-layout-shift"]?.numericValue ?? null;
        const labTbt = audits["total-blocking-time"]?.numericValue ?? null;
        const performanceScore = json.lighthouseResult?.categories?.performance?.score;
        const status = classify(fieldLcp ?? labLcp, fieldInp, fieldCls ?? labCls);

        const { data: previous } = await admin.from("seo_web_vitals_snapshots")
          .select("status,field_lcp_ms,field_inp_ms,field_cls,lab_lcp_ms,lab_cls")
          .eq("path", page.path).eq("device", device).order("measured_at", { ascending: false }).limit(1).maybeSingle();
        const regression = previous && previous.status !== "poor" && status === "poor";
        const regressionReason = regression ? `Core Web Vitals regressed from ${previous.status} to poor on ${device}.` : null;
        if (regression) regressions++;

        const { error: insertError } = await admin.from("seo_web_vitals_snapshots").insert({
          url: page.url, path: page.path, page_group: page.page_group, priority: page.priority ?? "P2", device,
          performance_score: typeof performanceScore === "number" ? Math.round(performanceScore * 100) : null,
          field_lcp_ms: fieldLcp, field_inp_ms: fieldInp, field_cls: fieldCls,
          field_source: Object.keys(json.loadingExperience?.metrics ?? {}).length ? "page" : Object.keys(json.originLoadingExperience?.metrics ?? {}).length ? "origin" : null,
          lab_lcp_ms: labLcp, lab_cls: labCls, lab_tbt_ms: labTbt, status,
          regression_detected: Boolean(regression), regression_reason: regressionReason,
          raw: { lighthouseVersion: json.lighthouseResult?.lighthouseVersion, fetchTime: json.lighthouseResult?.fetchTime },
        });
        if (insertError) throw new Error(insertError.message);
        measured++;
      } catch (e) {
        failures++;
        console.error("SEO CWV measurement failed", page.url, device, e);
      }
    }
  }
  return { ok: failures === 0, pages: pages?.length ?? 0, measured, regressions, failures };
}
