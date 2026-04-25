"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { getCleanerIdHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { buildCleanerOfferAcceptBody } from "@/lib/cleaner/cleanerOfferUxVariant";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import {
  bookingRowToMobileView,
  earningsSummaryFromRows,
  getActiveMobileJob,
  getNextUpcomingMobileJob,
} from "@/lib/cleaner/cleanerMobileBookingMap";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type MeCleaner = {
  id: string;
  full_name: string | null;
  phone?: string | null;
  phone_number?: string | null;
  email?: string | null;
  status?: string | null;
  is_available?: boolean | null;
  rating?: number | null;
  jobs_completed?: number | null;
  location?: string | null;
};

export type CleanerJobAction = "accept" | "en_route" | "start" | "complete";

function assertOnline(): { ok: true } | { ok: false; error: string } {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You appear offline. Reconnect, then try again." };
  }
  return { ok: true };
}

export function useCleanerMobileWorkspace() {
  const [rows, setRows] = useState<CleanerBookingRow[]>([]);
  const [offers, setOffers] = useState<CleanerOfferRow[]>([]);
  const [cleaner, setCleaner] = useState<MeCleaner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [offerActingId, setOfferActingId] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const [teamIdsForRealtime, setTeamIdsForRealtime] = useState<string[]>([]);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const loadSeq = useRef(0);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const load = useCallback(async () => {
    const headers = getCleanerIdHeaders();
    if (!headers) {
      setError("Not signed in.");
      setRows([]);
      setOffers([]);
      setCleaner(null);
      setLoading(false);
      return;
    }
    const seq = ++loadSeq.current;
    const [jobsRes, meRes, offersRes] = await Promise.all([
      fetch("/api/cleaner/jobs", { headers }),
      fetch("/api/cleaner/me", { headers }),
      fetch("/api/cleaner/offers", { headers }),
    ]);
    if (seq !== loadSeq.current) return;

    const j = (await jobsRes.json()) as { jobs?: CleanerBookingRow[]; error?: string };
    const m = (await meRes.json()) as { cleaner?: MeCleaner | null; teamIds?: string[]; error?: string };
    const o = (await offersRes.json()) as { offers?: CleanerOfferRow[]; error?: string };

    if (!jobsRes.ok) {
      setError(j.error ?? "Could not load jobs.");
      setRows([]);
    } else {
      setError(null);
      setRows(j.jobs ?? []);
    }
    setOffers(offersRes.ok ? (o.offers ?? []) : []);
    if (meRes.ok && m.cleaner) setCleaner(m.cleaner);
    setTeamIdsForRealtime(meRes.ok && Array.isArray(m.teamIds) ? m.teamIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => void load(), 22_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const id = typeof window !== "undefined" ? localStorage.getItem("cleaner_id")?.trim() : "";
    if (!sb || !id) return;

    let cancelled = false;
    let chBookings: ReturnType<typeof sb.channel> | null = null;
    let chOffers: ReturnType<typeof sb.channel> | null = null;
    let chTeamMembers: ReturnType<typeof sb.channel> | null = null;

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;

      chBookings = sb.channel(`cleaner-mobile-bookings-${id}`);
      chBookings.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `cleaner_id=eq.${id}` },
        () => void load(),
      );
      for (const tid of teamIdsForRealtime) {
        if (!tid.trim()) continue;
        chBookings.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `team_id=eq.${tid}` },
          () => void load(),
        );
      }
      chBookings.subscribe((status) => {
        if (!cancelled) setRealtimeOk(status === "SUBSCRIBED");
      });

      chOffers = sb
        .channel(`cleaner-mobile-offers-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dispatch_offers", filter: `cleaner_id=eq.${id}` },
          () => void load(),
        )
        .subscribe();

      chTeamMembers = sb
        .channel(`cleaner-mobile-team-members-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "team_members", filter: `cleaner_id=eq.${id}` },
          () => void load(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (chBookings) void sb.removeChannel(chBookings);
      if (chOffers) void sb.removeChannel(chOffers);
      if (chTeamMembers) void sb.removeChannel(chTeamMembers);
    };
  }, [load, teamIdsForRealtime]);

  const postJobAction = useCallback(async (bookingId: string, action: CleanerJobAction) => {
    const o = assertOnline();
    if (!o.ok) return o;
    const headers = getCleanerIdHeaders();
    if (!headers) return { ok: false as const, error: "Not signed in." };
    setActingId(bookingId);
    try {
      const res = await fetch(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) return { ok: false as const, error: json.error ?? "Action failed." };
      await load();
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Network error." };
    } finally {
      setActingId(null);
    }
  }, [load]);

  const respondToOffer = useCallback(
    async (offerId: string, action: "accept" | "decline", uxVariant?: string | null) => {
      const o = assertOnline();
      if (!o.ok) return o;
      const headers = getCleanerIdHeaders();
      if (!headers) return { ok: false as const, error: "Not signed in." };
      setOfferActingId(offerId);
      const resolvedUx = uxVariant ?? offers.find((x) => x.id === offerId)?.ux_variant;
      try {
        const res = await fetch(`/api/cleaner/offers/${encodeURIComponent(offerId)}/${action}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(action === "accept" ? buildCleanerOfferAcceptBody(resolvedUx) : {}),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) return { ok: false as const, error: json.error ?? "Could not update offer." };
        await load();
        return { ok: true as const };
      } catch {
        return { ok: false as const, error: "Network error." };
      } finally {
        setOfferActingId(null);
      }
    },
    [load, offers],
  );

  const setAvailability = useCallback(async (next: boolean) => {
    const o = assertOnline();
    if (!o.ok) return o;
    const headers = getCleanerIdHeaders();
    if (!headers) return { ok: false as const, error: "Not signed in." };
    try {
      const res = await fetch("/api/cleaner/me", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: next }),
      });
      const json = (await res.json()) as { cleaner?: MeCleaner; error?: string };
      if (!res.ok) return { ok: false as const, error: json.error ?? "Update failed." };
      if (json.cleaner) setCleaner(json.cleaner);
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Network error." };
    }
  }, []);

  const activeJob = useMemo(() => getActiveMobileJob(rows), [rows]);
  const nextJob = useMemo(() => getNextUpcomingMobileJob(rows), [rows]);
  const earnings = useMemo(() => earningsSummaryFromRows(rows, new Date()), [rows]);
  /** Dispatch offers only — team-assigned jobs never appear here (they live under My Jobs). */
  const availableOffers = useMemo(
    () => offers.filter((o) => o.booking == null || o.booking.is_team_job !== true),
    [offers],
  );
  const topOffer = useMemo(() => availableOffers[0] ?? null, [availableOffers]);

  const earningsRows = useMemo(() => {
    const completed = rows.filter((r) => String(r.status ?? "").toLowerCase() === "completed");
    const sorted = [...completed].sort((a, b) =>
      String(b.completed_at ?? b.date ?? "").localeCompare(String(a.completed_at ?? a.date ?? "")),
    );
    return sorted.slice(0, 25).map((r) => {
      const view = bookingRowToMobileView(r);
      const display = r.displayEarningsCents;
      const displayEarningsZar =
        display != null && Number.isFinite(Number(display)) ? Math.round(Number(display) / 100) : null;
      return {
        id: r.id,
        serviceLabel: `${r.service ?? "Job"} · ${view.areaLabel}`,
        displayEarningsZar,
        payoutStatus: r.payout_id ? ("paid" as const) : ("pending" as const),
      };
    });
  }, [rows]);

  const profile = useMemo(() => {
    if (!cleaner) return null;
    const phone = String(cleaner.phone_number ?? cleaner.phone ?? "").trim() || "—";
    const areas = cleaner.location?.trim() ? [cleaner.location.trim()] : ["Areas not set"];
    return {
      name: cleaner.full_name?.trim() || "Cleaner",
      phone,
      areas,
      rating: typeof cleaner.rating === "number" && Number.isFinite(cleaner.rating) ? cleaner.rating : 5,
      isAvailable: cleaner.is_available === true || String(cleaner.status ?? "").toLowerCase() === "available",
    };
  }, [cleaner]);

  return {
    rows,
    offers,
    topOffer,
    loading,
    error,
    reload: load,
    actingId,
    offerActingId,
    postJobAction,
    respondToOffer,
    setAvailability,
    activeJob,
    nextJob,
    earnings,
    earningsRows,
    profile,
    realtimeOk,
    online,
  };
}
