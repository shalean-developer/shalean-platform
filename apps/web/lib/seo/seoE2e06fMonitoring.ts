export type SeoE2e06fTarget = {
  path: string;
  group: "pricing" | "service" | "location";
  action: "monitor_only" | "manual_gsc_request_if_not_indexed";
  note: string;
};

export const SEO_E2E_06F_RECHECK_DAYS = [7, 21] as const;

export const SEO_E2E_06F_TARGETS: readonly SeoE2e06fTarget[] = [
  {
    path: "/cleaning-prices-cape-town",
    group: "pricing",
    action: "manual_gsc_request_if_not_indexed",
    note: "Verify indexation after the corrected pricing page is live; use GSC UI Request Indexing only if still not indexed.",
  },
  {
    path: "/services/deep-cleaning-cape-town",
    group: "service",
    action: "monitor_only",
    note: "Ownership/content remediation completed in SEO-E2E-06B; avoid repeated edits before recrawl.",
  },
  {
    path: "/services/carpet-cleaning-cape-town",
    group: "service",
    action: "monitor_only",
    note: "Ranking recovery completed in SEO-E2E-06C; track query/page position and impressions after recrawl.",
  },
  {
    path: "/locations/hout-bay-cleaning-services",
    group: "location",
    action: "monitor_only",
    note: "Medium-tier recovery completed in SEO-E2E-06D.",
  },
  {
    path: "/locations/claremont-cleaning-services",
    group: "location",
    action: "monitor_only",
    note: "Existing high-tier comparison hub; no 06D rewrite applied.",
  },
  {
    path: "/locations/plumstead-cleaning-services",
    group: "location",
    action: "monitor_only",
    note: "Medium-tier page received local pricing and nearby-hub reinforcement in SEO-E2E-06D.",
  },
  {
    path: "/locations/rosebank-cleaning-services",
    group: "location",
    action: "monitor_only",
    note: "Medium-tier recovery completed in SEO-E2E-06D.",
  },
  {
    path: "/locations/rondebosch-east-cleaning-services",
    group: "location",
    action: "monitor_only",
    note: "Medium-tier recovery completed in SEO-E2E-06D.",
  },
  {
    path: "/locations/constantia-cleaning-services",
    group: "location",
    action: "monitor_only",
    note: "High-tier page was already healthy and was intentionally left unchanged in SEO-E2E-06E.",
  },
  {
    path: "/locations/bantry-bay-cleaning-services",
    group: "location",
    action: "monitor_only",
    note: "Medium-tier indexation-strengthening completed in SEO-E2E-06E.",
  },
] as const;
