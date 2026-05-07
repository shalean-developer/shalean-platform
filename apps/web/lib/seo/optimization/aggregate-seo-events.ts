import type { SupabaseClient } from "@supabase/supabase-js";

export const SEO_INSIGHTS_EVENT_TYPES = [
  "seo_location_scroll",
  "seo_cta_click",
  "seo_service_card_click",
  "seo_faq_expand",
  "seo_pricing_interaction",
  "start_booking",
] as const;

export type SeoInsightsEventType = (typeof SEO_INSIGHTS_EVENT_TYPES)[number];

export type UserEventRow = {
  event_type: string;
  payload: Record<string, unknown> | null;
};

export function sessionIdFromPayload(p: Record<string, unknown> | null): string | null {
  if (!p) return null;
  const s = p.session_id;
  return typeof s === "string" && s.length > 0 ? s : null;
}

export type ScrollFunnelRow = {
  slug: string;
  sessions_at_25: number;
  sessions_at_50: number;
  sessions_at_75: number;
  sessions_at_100: number;
  pct_to_50: number;
  pct_to_75: number;
  pct_to_100: number;
};

export type CtaKindLocationBookingRow = {
  cta_kind: string;
  cta_location: string;
  key: string;
  distinct_sessions: number;
  sessions_with_booking_start: number;
  conversion_pct: number;
};

export type HeroBookNowLabelRollup = {
  slug: string;
  label: string;
  clicks: number;
};

export type SuburbCtaBookingRollup = {
  suburb: string;
  sessions_with_cta: number;
  sessions_with_booking_start: number;
  conversion_pct: number;
};

export type SlugCtaKindLocationBookingRow = {
  slug: string;
  cta_kind: string;
  cta_location: string;
  key: string;
  distinct_sessions: number;
  sessions_with_booking_start: number;
  conversion_pct: number;
};

export type AggregatedSeoEvents = {
  scrollFunnels: ScrollFunnelRow[];
  ctaKindLocationBooking: CtaKindLocationBookingRow[];
  slugCtaKindLocationBooking: SlugCtaKindLocationBookingRow[];
  heroBookNowBySlugLabel: HeroBookNowLabelRollup[];
  suburbCtaBooking: SuburbCtaBookingRollup[];
  topSuburbsByCtaClicks: { suburb: string; seo_cta_clicks: number }[];
  topCtaCompound: { key: string; count: number }[];
};

function sortCountEntries(map: Map<string, number>, limit: number): { key: string; count: number }[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export function aggregateSeoUserEvents(rows: UserEventRow[]): AggregatedSeoEvents {
  const suburbClicks = new Map<string, number>();
  const ctaCompound = new Map<string, number>();
  const ctaKindLocSessions = new Map<string, Set<string>>();
  const slugCtaKindLocSessions = new Map<string, Map<string, Set<string>>>();
  const bookingSessions = new Set<string>();

  const scrollBySlugDepth = new Map<string, Map<number, Set<string>>>();

  const heroBookSlugLabelClicks = new Map<string, Map<string, number>>();
  const suburbCtaSessions = new Map<string, Set<string>>();

  for (const r of rows) {
    const pl = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : null;
    const sid = sessionIdFromPayload(pl);

    if (r.event_type === "start_booking" && sid) bookingSessions.add(sid);

    if (r.event_type === "seo_cta_click" && pl) {
      const pageType = pl.page_type;
      const suburb = typeof pl.suburb === "string" ? pl.suburb.trim() : "";
      if (pageType === "seo_location" && suburb) {
        suburbClicks.set(suburb, (suburbClicks.get(suburb) ?? 0) + 1);
        if (sid) {
          if (!suburbCtaSessions.has(suburb)) suburbCtaSessions.set(suburb, new Set());
          suburbCtaSessions.get(suburb)!.add(sid);
        }
      }
      const kind = typeof pl.cta_kind === "string" ? pl.cta_kind : "unknown";
      const loc = typeof pl.cta_location === "string" ? pl.cta_location : "";
      const label = typeof pl.cta_label === "string" ? pl.cta_label : "";
      const compoundKey = `${kind} · ${loc} · ${label}`;
      ctaCompound.set(compoundKey, (ctaCompound.get(compoundKey) ?? 0) + 1);

      const klKey = `${kind}\t${loc}`;
      if (sid) {
        if (!ctaKindLocSessions.has(klKey)) ctaKindLocSessions.set(klKey, new Set());
        ctaKindLocSessions.get(klKey)!.add(sid);
      }

      const slug = typeof pl.page_slug === "string" ? pl.page_slug.trim() : "";
      if (pageType === "seo_location" && slug && sid) {
        if (!slugCtaKindLocSessions.has(slug)) slugCtaKindLocSessions.set(slug, new Map());
        const sk = `${kind}|${loc}`;
        const inner = slugCtaKindLocSessions.get(slug)!;
        if (!inner.has(sk)) inner.set(sk, new Set());
        inner.get(sk)!.add(sid);
      }
      if (pageType === "seo_location" && slug && loc === "hero" && kind === "book_now") {
        if (!heroBookSlugLabelClicks.has(slug)) heroBookSlugLabelClicks.set(slug, new Map());
        const lm = heroBookSlugLabelClicks.get(slug)!;
        lm.set(label, (lm.get(label) ?? 0) + 1);
      }
    }

    if (r.event_type === "seo_location_scroll" && pl && sid) {
      const slug = typeof pl.page_slug === "string" ? pl.page_slug : "";
      const depth = pl.depth;
      if (!slug || (depth !== 25 && depth !== 50 && depth !== 75 && depth !== 100)) continue;
      if (!scrollBySlugDepth.has(slug)) scrollBySlugDepth.set(slug, new Map());
      const dm = scrollBySlugDepth.get(slug)!;
      if (!dm.has(depth)) dm.set(depth, new Set());
      dm.get(depth)!.add(sid);
    }
  }

  const ctaKindLocationBooking: CtaKindLocationBookingRow[] = [...ctaKindLocSessions.entries()].map(([compound, sids]) => {
    const [cta_kind, cta_location] = compound.split("\t");
    let withBooking = 0;
    for (const id of sids) {
      if (bookingSessions.has(id)) withBooking++;
    }
    const conversion_pct = sids.size > 0 ? Math.round((withBooking / sids.size) * 1000) / 10 : 0;
    return {
      key: `${cta_kind}|${cta_location}`,
      cta_kind: cta_kind ?? "unknown",
      cta_location: cta_location ?? "",
      distinct_sessions: sids.size,
      sessions_with_booking_start: withBooking,
      conversion_pct,
    };
  });
  ctaKindLocationBooking.sort((a, b) => b.distinct_sessions - a.distinct_sessions);

  const slugCtaKindLocationBooking: SlugCtaKindLocationBookingRow[] = [];
  for (const [slug, inner] of slugCtaKindLocSessions) {
    for (const [sk, sids] of inner) {
      const pipe = sk.indexOf("|");
      const cta_kind = pipe >= 0 ? sk.slice(0, pipe) : sk;
      const cta_location = pipe >= 0 ? sk.slice(pipe + 1) : "";
      let withBooking = 0;
      for (const id of sids) {
        if (bookingSessions.has(id)) withBooking++;
      }
      const conversion_pct = sids.size > 0 ? Math.round((withBooking / sids.size) * 1000) / 10 : 0;
      slugCtaKindLocationBooking.push({
        slug,
        cta_kind,
        cta_location,
        key: sk,
        distinct_sessions: sids.size,
        sessions_with_booking_start: withBooking,
        conversion_pct,
      });
    }
  }
  slugCtaKindLocationBooking.sort((a, b) => b.distinct_sessions - a.distinct_sessions);

  const scrollFunnels: ScrollFunnelRow[] = [...scrollBySlugDepth.entries()].map(([slug, dm]) => {
    const n25 = dm.get(25)?.size ?? 0;
    const n50 = dm.get(50)?.size ?? 0;
    const n75 = dm.get(75)?.size ?? 0;
    const n100 = dm.get(100)?.size ?? 0;
    const pct_to_50 = n25 > 0 ? Math.round((n50 / n25) * 1000) / 10 : 0;
    const pct_to_75 = n25 > 0 ? Math.round((n75 / n25) * 1000) / 10 : 0;
    const pct_to_100 = n25 > 0 ? Math.round((n100 / n25) * 1000) / 10 : 0;
    return { slug, sessions_at_25: n25, sessions_at_50: n50, sessions_at_75: n75, sessions_at_100: n100, pct_to_50, pct_to_75, pct_to_100 };
  });
  scrollFunnels.sort((a, b) => b.sessions_at_25 - a.sessions_at_25);

  const heroBookNowBySlugLabel: HeroBookNowLabelRollup[] = [];
  for (const [slug, lm] of heroBookSlugLabelClicks) {
    for (const [label, clicks] of lm) {
      heroBookNowBySlugLabel.push({ slug, label, clicks });
    }
  }
  heroBookNowBySlugLabel.sort((a, b) => b.clicks - a.clicks);

  const suburbCtaBooking: SuburbCtaBookingRollup[] = [...suburbCtaSessions.entries()].map(([suburb, sids]) => {
    let withBooking = 0;
    for (const id of sids) {
      if (bookingSessions.has(id)) withBooking++;
    }
    const conversion_pct = sids.size > 0 ? Math.round((withBooking / sids.size) * 1000) / 10 : 0;
    return {
      suburb,
      sessions_with_cta: sids.size,
      sessions_with_booking_start: withBooking,
      conversion_pct,
    };
  });
  suburbCtaBooking.sort((a, b) => b.sessions_with_cta - a.sessions_with_cta);

  return {
    scrollFunnels,
    ctaKindLocationBooking,
    slugCtaKindLocationBooking,
    heroBookNowBySlugLabel,
    suburbCtaBooking,
    topSuburbsByCtaClicks: sortCountEntries(suburbClicks, 25).map(({ key, count }) => ({
      suburb: key,
      seo_cta_clicks: count,
    })),
    topCtaCompound: sortCountEntries(ctaCompound, 30),
  };
}

/**
 * SEO-relevant `user_events` in `[startIso, endIsoExclusive)` when `endIsoExclusive` is set,
 * otherwise `[startIso, ∞)`.
 */
export async function fetchSeoInsightUserEventsWindow(
  admin: SupabaseClient,
  startIso: string,
  endIsoExclusive: string | null,
): Promise<{ rows: UserEventRow[]; error: string | null }> {
  let q = admin
    .from("user_events")
    .select("event_type, payload, created_at")
    .gte("created_at", startIso)
    .in("event_type", [...SEO_INSIGHTS_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(50_000);
  if (endIsoExclusive) {
    q = q.lt("created_at", endIsoExclusive);
  }
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as UserEventRow[], error: null };
}

export async function fetchSeoInsightUserEvents(
  admin: SupabaseClient,
  windowDays: number,
): Promise<{ sinceIso: string; rows: UserEventRow[]; error: string | null }> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceIso = since.toISOString();
  const { rows, error } = await fetchSeoInsightUserEventsWindow(admin, sinceIso, null);
  return { sinceIso, rows, error };
}
