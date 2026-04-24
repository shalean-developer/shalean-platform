"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCleanerOfferAcceptBody } from "@/lib/cleaner/cleanerOfferUxVariant";
import { reportDispatchOfferExposed } from "@/lib/cleaner/reportDispatchOfferExposed";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type CleanerProfile = {
  id: string;
  full_name: string | null;
  status: string | null;
  is_available?: boolean | null;
  rating?: number | null;
  jobs_completed?: number | null;
};

type OfferRow = {
  id: string;
  booking_id: string;
  status: string;
  expires_at: string;
  created_at: string;
  ux_variant?: string | null;
  booking: {
    id: string;
    service: string | null;
    date: string | null;
    time: string | null;
    location: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    status: string | null;
  } | null;
};

type JobRow = {
  id: string;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  status: string | null;
  total_paid_zar: number | null;
};

type ToastState = { kind: "success" | "error"; text: string } | null;

type CleanerRouteStop = {
  id: string;
  time: string;
  service: string | null;
  locationLabel: string | null;
  travelMinutesFromPrev: number;
};

function isToday(dateYmd: string | null): boolean {
  if (!dateYmd) return false;
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return dateYmd === `${y}-${m}-${d}`;
}

function weekBucket(dateYmd: string | null): number {
  if (!dateYmd) return 9_999_999;
  const d = new Date(`${dateYmd}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.getTime() : 9_999_999;
}

export default function CleanerHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const offerIdFromQuery = searchParams.get("offerId");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [toast, setToast] = useState<ToastState>(null);
  const [profile, setProfile] = useState<CleanerProfile | null>(null);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [newOfferPulse, setNewOfferPulse] = useState(false);
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);
  const [routeToday, setRouteToday] = useState<{
    jobs: CleanerRouteStop[];
    metrics: { travelTimeSavedMinutes: number; jobsPerCleanerPerDay: number };
  } | null>(null);
  const [cleanerId, setCleanerId] = useState<string | null>(null);
  const [referral, setReferral] = useState<{
    referralCode: string;
    totalEarned: number;
    referralsCount: number;
    bonusPayout: number;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownOfferIdsRef = useRef<Set<string>>(new Set());
  const notificationsArmedRef = useRef(false);

  const load = useCallback(async () => {
    const sid = typeof window !== "undefined" ? localStorage.getItem("cleaner_id") : null;
    if (!sid) {
      router.replace("/cleaner/login");
      return;
    }
    setCleanerId(sid);
    const headers = { "x-cleaner-id": sid };

    const [meRes, offersRes, jobsRes, refRes, routeRes] = await Promise.all([
      fetch("/api/cleaner/me", { headers }),
      fetch("/api/cleaner/offers", { headers }),
      fetch("/api/cleaner/jobs", { headers }),
      fetch("/api/cleaner/referrals/me", { headers }),
      fetch("/api/cleaner/route", { headers }),
    ]);

    const meJson = (await meRes.json()) as { cleaner?: CleanerProfile | null; isCleaner?: boolean; error?: string };
    const offersJson = (await offersRes.json()) as { offers?: OfferRow[]; error?: string };
    const jobsJson = (await jobsRes.json()) as { jobs?: JobRow[]; error?: string };
    const refJson = (await refRes.json()) as {
      referralCode?: string;
      totalEarned?: number;
      referralsCount?: number;
      bonusPayout?: number;
    };
    const routeJson = (await routeRes.json()) as {
      route?: {
        jobs?: CleanerRouteStop[];
        metrics?: { travelTimeSavedMinutes?: number; jobsPerCleanerPerDay?: number };
      };
    };

    if (!meRes.ok || meJson.isCleaner === false) {
      setToast({ kind: "error", text: meJson.error ?? "Not a cleaner account." });
      if (typeof window !== "undefined") localStorage.removeItem("cleaner_id");
      router.replace("/cleaner/login");
      setLoading(false);
      return;
    }

    setProfile(meJson.cleaner ?? null);
    setOffers(offersRes.ok ? (offersJson.offers ?? []) : []);
    setJobs(jobsRes.ok ? (jobsJson.jobs ?? []) : []);
    if (refRes.ok && refJson.referralCode) {
      setReferral({
        referralCode: refJson.referralCode,
        totalEarned: Number(refJson.totalEarned ?? 0),
        referralsCount: Number(refJson.referralsCount ?? 0),
        bonusPayout: Number(refJson.bonusPayout ?? 0),
      });
    }
    if (routeRes.ok && routeJson.route) {
      setRouteToday({
        jobs: routeJson.route.jobs ?? [],
        metrics: {
          travelTimeSavedMinutes: Number(routeJson.route.metrics?.travelTimeSavedMinutes ?? 0),
          jobsPerCleanerPerDay: Number(routeJson.route.metrics?.jobsPerCleanerPerDay ?? 0),
        },
      });
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    // Track known offers so only new INSERT events trigger alerts.
    knownOfferIdsRef.current = new Set(offers.map((o) => o.id));
  }, [offers]);

  useEffect(() => {
    // Sound setup + autoplay unlock on first interaction.
    const audio = new Audio("/sounds/notify.mp3");
    audio.preload = "auto";
    audioRef.current = audio;

    const unlock = () => {
      void audio.play().catch(() => {});
      audio.pause();
      audio.currentTime = 0;
    };

    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });

    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Register service worker for future PWA push upgrades.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    // Ask notification permission once per session.
    if (!("Notification" in window) || notificationsArmedRef.current) return;
    notificationsArmedRef.current = true;
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  }, []);

  const playNewOfferSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, []);

  const pushNewOfferNotification = useCallback((offerId: string) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification("New Cleaning Job", {
      body: "Tap to view job offer",
      icon: "/icons/icon-192.png",
      tag: `offer-${offerId}`,
    });
    n.onclick = () => {
      window.focus();
      const target = `/cleaner?offerId=${encodeURIComponent(offerId)}`;
      if (window.location.pathname + window.location.search !== target) {
        window.location.assign(target);
      }
      n.close();
    };
  }, []);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb || !profile?.id) return;

    let cancelled = false;
    let offersChannel: ReturnType<typeof sb.channel> | null = null;
    let bookingsChannel: ReturnType<typeof sb.channel> | null = null;
    let cleanersChannel: ReturnType<typeof sb.channel> | null = null;
    const selectedOfferId =
      (offerIdFromQuery ? offers.find((o) => o.id === offerIdFromQuery)?.id : offers[0]?.id) ?? null;

    const connect = () => {
      offersChannel = sb
        .channel(`cleaner-offers-${profile.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "dispatch_offers",
            filter: `cleaner_id=eq.${profile.id}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as { id?: string; status?: string } | null;
              const offerId = String(row?.id ?? "");
              const status = String(row?.status ?? "").toLowerCase();
              if (offerId && status === "pending" && !knownOfferIdsRef.current.has(offerId)) {
                knownOfferIdsRef.current.add(offerId);
                playNewOfferSound();
                pushNewOfferNotification(offerId);
              }
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as { id?: string; status?: string } | null;
              const offerId = String(row?.id ?? "");
              const status = String(row?.status ?? "").toLowerCase();
              if (
                offerId &&
                selectedOfferId === offerId &&
                (status === "expired" || status === "accepted" || status === "rejected")
              ) {
                setToast({ kind: "error", text: "Job taken by another cleaner" });
              }
            }
            setNewOfferPulse(true);
            void load();
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          setRealtimeHealthy(status === "SUBSCRIBED");
        });

      bookingsChannel = sb
        .channel(`cleaner-bookings-rt-${profile.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `cleaner_id=eq.${profile.id}` },
          () => {
            void load();
          },
        )
        .subscribe();

      cleanersChannel = sb
        .channel(`cleaner-profile-${profile.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cleaners", filter: `id=eq.${profile.id}` },
          () => {
            void load();
          },
        )
        .subscribe();
    };

    if (!document.hidden) {
      connect();
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (offersChannel) void sb.removeChannel(offersChannel);
        if (bookingsChannel) void sb.removeChannel(bookingsChannel);
        if (cleanersChannel) void sb.removeChannel(cleanersChannel);
        offersChannel = null;
        bookingsChannel = null;
        cleanersChannel = null;
        return;
      }
      if (!offersChannel && !bookingsChannel && !cleanersChannel) {
        connect();
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (offersChannel) void sb.removeChannel(offersChannel);
      if (bookingsChannel) void sb.removeChannel(bookingsChannel);
      if (cleanersChannel) void sb.removeChannel(cleanersChannel);
    };
  }, [offerIdFromQuery, offers, load, playNewOfferSound, profile?.id, pushNewOfferNotification]);

  useEffect(() => {
    if (!newOfferPulse) return;
    const t = window.setTimeout(() => setNewOfferPulse(false), 1600);
    return () => window.clearTimeout(t);
  }, [newOfferPulse]);

  useEffect(() => {
    // Realtime fallback polling.
    const t = window.setInterval(() => {
      if (!realtimeHealthy) void load();
    }, 15_000);
    return () => window.clearInterval(t);
  }, [load, realtimeHealthy]);

  const highlightedOffer = useMemo(() => {
    if (!offerIdFromQuery) return offers[0] ?? null;
    return offers.find((o) => o.id === offerIdFromQuery) ?? offers[0] ?? null;
  }, [offerIdFromQuery, offers]);

  useEffect(() => {
    if (!highlightedOffer?.id) return;
    const sid = cleanerId ?? (typeof window !== "undefined" ? localStorage.getItem("cleaner_id") : null);
    if (!sid?.trim()) return;
    reportDispatchOfferExposed(highlightedOffer.id, { "x-cleaner-id": sid.trim() });
  }, [highlightedOffer?.id, cleanerId]);

  const secondsLeft = highlightedOffer
    ? Math.max(0, Math.floor((new Date(highlightedOffer.expires_at).getTime() - nowMs) / 1000))
    : 0;

  const todayEarnings = jobs
    .filter((j) => isToday(j.date))
    .reduce((s, j) => s + Number(j.total_paid_zar ?? 0), 0);

  const weekEarnings = jobs
    .filter((j) => {
      if (!j.date) return false;
      const t = new Date();
      const day = t.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(t);
      monday.setDate(t.getDate() - diff);
      monday.setHours(0, 0, 0, 0);
      const jd = new Date(`${j.date}T00:00:00`);
      return jd >= monday;
    })
    .reduce((s, j) => s + Number(j.total_paid_zar ?? 0), 0);

  const upcoming = [...jobs]
    .filter((j) => ["assigned", "in_progress"].includes(String(j.status ?? "").toLowerCase()))
    .sort((a, b) => weekBucket(a.date) - weekBucket(b.date));

  function getCleanerHeaders(): Record<string, string> | null {
    const sid = cleanerId ?? (typeof window !== "undefined" ? localStorage.getItem("cleaner_id") : null);
    if (!sid) return null;
    return { "x-cleaner-id": sid };
  }

  async function toggleAvailability(next: boolean) {
    setBusy(true);
    const headers = getCleanerHeaders();
    if (!headers) {
      router.replace("/cleaner/login");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/cleaner/me", {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ is_available: next }),
    });
    const json = (await res.json()) as { cleaner?: CleanerProfile; error?: string };
    setBusy(false);
    if (!res.ok) {
      setToast({ kind: "error", text: json.error ?? "Failed to update status." });
      return;
    }
    setProfile(json.cleaner ?? null);
    setToast({ kind: "success", text: next ? "You are now available" : "You are now offline" });
  }

  async function respondToOffer(offerId: string, action: "accept" | "decline", uxVariant?: string | null) {
    setBusy(true);
    const headers = getCleanerHeaders();
    if (!headers) {
      router.replace("/cleaner/login");
      setBusy(false);
      return;
    }
    const resolvedUx =
      uxVariant ?? offers.find((o) => o.id === offerId)?.ux_variant ?? highlightedOffer?.ux_variant;
    const res = await fetch(`/api/cleaner/offers/${encodeURIComponent(offerId)}/${action}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(action === "accept" ? buildCleanerOfferAcceptBody(resolvedUx) : {}),
    });
    const json = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setToast({ kind: "error", text: json.error ?? "Action failed." });
      return;
    }
    setToast({ kind: "success", text: action === "accept" ? "Offer accepted" : "Offer declined" });
    await load();
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </main>
    );
  }

  const isAvailable = profile?.is_available === true || String(profile?.status ?? "").toLowerCase() === "available";

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Cleaner Dashboard</p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{profile?.full_name ?? "Cleaner"}</h1>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem("cleaner_id");
            router.replace("/cleaner/login");
          }}
          className="mt-2 rounded-lg border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
        >
          Logout
        </button>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleAvailability(true)}
            className={[
              "min-h-12 flex-1 rounded-xl px-3 text-sm font-semibold",
              isAvailable ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
            ].join(" ")}
          >
            🟢 Available
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleAvailability(false)}
            className={[
              "min-h-12 flex-1 rounded-xl px-3 text-sm font-semibold",
              !isAvailable ? "bg-rose-600 text-white" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
            ].join(" ")}
          >
            🔴 Offline
          </button>
        </div>
      </section>

      <section
        className={[
          "rounded-2xl border p-4 shadow-sm transition",
          newOfferPulse ? "animate-pulse" : "",
          highlightedOffer
            ? offerIdFromQuery && highlightedOffer.id === offerIdFromQuery
              ? "border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
        ].join(" ")}
      >
        <p className="text-xs uppercase tracking-wide text-zinc-500">Active Job Offer</p>
        {highlightedOffer ? (
          <>
            <h2 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">New Job Available</h2>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              📍 {highlightedOffer.booking?.location ?? "TBD"}
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              🕒 {highlightedOffer.booking?.date ?? ""} {highlightedOffer.booking?.time ?? ""}
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              💰 R {(highlightedOffer.booking as { total_paid_zar?: number } | null)?.total_paid_zar ?? "TBD"}
            </p>
            <p className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-100">Respond in {secondsLeft}s</p>
            <div className="sticky bottom-2 mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void respondToOffer(highlightedOffer.id, "accept", highlightedOffer.ux_variant)}
                className="min-h-12 flex-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void respondToOffer(highlightedOffer.id, "decline")}
                className="min-h-12 flex-1 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Decline
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No pending offers right now.</p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {referral ? (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/25">
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">Refer a cleaner, earn R100</p>
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">Referrals: {referral.referralsCount} · Earned: R {referral.totalEarned.toLocaleString("en-ZA")}</p>
            <p className="mt-1 break-all text-xs text-zinc-600 dark:text-zinc-300">
              /cleaner/apply?ref={referral.referralCode}
            </p>
            <button
              type="button"
              className="mt-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
              onClick={() => {
                const link = `${window.location.origin}/cleaner/apply?ref=${referral.referralCode}`;
                void navigator.clipboard.writeText(link);
                setToast({ kind: "success", text: "Referral link copied" });
              }}
            >
              Copy link
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Today Summary</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Jobs today" value={String(jobs.filter((j) => isToday(j.date)).length)} />
          <Stat label="Earnings today" value={`R ${todayEarnings.toLocaleString("en-ZA")}`} />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Earnings</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Today" value={`R ${todayEarnings.toLocaleString("en-ZA")}`} />
          <Stat label="This week" value={`R ${weekEarnings.toLocaleString("en-ZA")}`} />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Your route today</p>
        <div className="mt-2 space-y-2">
          {(routeToday?.jobs ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">No route scheduled yet.</p>
          ) : (
            routeToday?.jobs.map((job) => (
              <article key={job.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {job.time} {"->"} {job.service ?? "Cleaning"}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">{job.locationLabel ?? "Location TBD"}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Travel from previous stop: {job.travelMinutesFromPrev} min</p>
              </article>
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Travel time saved today: {routeToday?.metrics.travelTimeSavedMinutes ?? 0} min
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Upcoming Jobs</p>
        <div className="mt-3 space-y-3">
          {upcoming.length === 0 ? (
            <p className="text-sm text-zinc-500">No upcoming assigned jobs.</p>
          ) : (
            upcoming.map((job) => (
              <article key={job.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{job.service ?? "Cleaning"}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {job.date ?? "—"} {job.time ?? ""}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{job.location ?? "Location TBD"}</p>
                <span className="mt-2 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  {job.status ?? "—"}
                </span>
              </article>
            ))
          )}
        </div>
      </section>

      {toast ? <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} /> : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-3 dark:bg-zinc-800/60">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-28 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />;
}

function Toast({ kind, text, onClose }: { kind: "success" | "error"; text: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 2500);
    return () => window.clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-[70]">
      <div
        className={[
          "rounded-lg px-4 py-2 text-sm font-medium shadow-lg",
          kind === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}
