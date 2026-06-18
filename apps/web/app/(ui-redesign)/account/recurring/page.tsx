"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HelpCircle,
  Pause,
  Play,
  Repeat,
  SkipForward,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useCustomerRecurringRealtime } from "@/hooks/useCustomerRecurringRealtime";
import { useUser } from "@/hooks/useUser";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { Button } from "@/components/ui/button";
import { HelpCard } from "@/components/account/HelpCard";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { addDaysYmd, compareYmd } from "@/lib/recurring/johannesburgCalendar";
import { describeBookingOperationalState } from "@/lib/booking/describeBookingOperationalState";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function formatDays(days: number[]): string {
  const uniq = [...new Set(days.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  return uniq.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

function frequencyLabel(f: string): string {
  const x = f.toLowerCase();
  if (x === "weekly") return "Weekly";
  if (x === "biweekly") return "Bi-weekly";
  if (x === "monthly") return "Monthly";
  return f || "—";
}

function formatHm(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  return t || null;
}

function formatPaymentStatusLabel(raw: string | null | undefined): { label: string; tone: "ok" | "wait" | "bad" | "muted" } {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s || s === "pending") return { label: "Pending payment", tone: "wait" };
  if (s === "paid" || s === "success") return { label: "Paid", tone: "ok" };
  if (s === "failed" || s === "partial_failed") return { label: "Failed", tone: "bad" };
  if (s === "expired") return { label: "Link expired", tone: "muted" };
  return { label: (raw ?? "").trim() || "—", tone: "muted" };
}

function paymentToneClass(tone: "ok" | "wait" | "bad" | "muted"): string {
  if (tone === "ok") return "font-medium text-green-700";
  if (tone === "wait") return "font-medium text-amber-700";
  if (tone === "bad") return "font-medium text-red-700";
  return "text-gray-500";
}

function relativeDayPart(dateYmd: string, todayYmd: string): string {
  const tomorrow = addDaysYmd(todayYmd, 1);
  if (compareYmd(dateYmd, todayYmd) === 0) return "Today";
  if (compareYmd(dateYmd, tomorrow) === 0) return "Tomorrow";
  return new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "short", timeZone: "Africa/Johannesburg" }).format(
    new Date(`${dateYmd}T12:00:00+02:00`),
  );
}

type MeRecurringVisitRow = {
  id: string;
  recurring_id: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  location: string | null;
  payment_status: string | null;
  payment_completed_at: string | null;
  cleaner_response_status: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  dispatch_status: string | null;
  is_recurring_generated: boolean | null;
  billing_type: string | null;
  monthly_invoice_id: string | null;
};

type MeRecurringItem = {
  id: string;
  address_id: string | null;
  frequency: string;
  days_of_week: number[];
  start_date: string | null;
  end_date: string | null;
  price: number;
  status: string;
  next_run_date: string;
  last_generated_at: string | null;
  skip_next_occurrence_date: string | null;
  monthly_pattern: string;
  monthly_nth: number | null;
  created_at: string | null;
  updated_at: string | null;
  template_visit_date: string | null;
  template_visit_time: string | null;
  template_location: string | null;
  upcoming_bookings: MeRecurringVisitRow[];
};

function nextCleaningLine(r: MeRecurringItem, todayYmd: string): string | null {
  const visitHm = formatHm(r.template_visit_time);
  const first = r.upcoming_bookings[0];
  if (first?.date) {
    const t = formatHm(first.time) ?? visitHm;
    const day = relativeDayPart(first.date, todayYmd);
    return t ? `${day} · ${t}` : day;
  }
  const st = r.status.toLowerCase();
  const skip = Boolean(r.skip_next_occurrence_date?.trim());
  if (st === "active" && r.next_run_date && !skip) {
    const day = relativeDayPart(r.next_run_date, todayYmd);
    return visitHm ? `${day} · ${visitHm}` : day;
  }
  return null;
}

function recurringVisitOperationalBadge(b: MeRecurringVisitRow): string {
  return describeBookingOperationalState({
    row: {
      status: b.status,
      payment_completed_at: b.payment_completed_at ?? null,
      cleaner_response_status: b.cleaner_response_status ?? null,
      en_route_at: b.en_route_at ?? null,
      started_at: b.started_at ?? null,
      completed_at: b.completed_at ?? null,
      dispatch_status: b.dispatch_status ?? null,
      is_recurring_generated: b.is_recurring_generated ?? true,
      billing_type: b.billing_type ?? null,
      monthly_invoice_id: b.monthly_invoice_id ?? null,
    },
    viewer: "admin",
  }).displayBadge;
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Active
      </span>
    );
  }
  if (s === "paused") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        <Pause className="h-3 w-3" />
        Paused
      </span>
    );
  }
  if (s === "cancelled") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
      {status}
    </span>
  );
}

const POPULAR_PLANS = [
  {
    icon: Zap,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Weekly",
    desc: "A fresh clean every 7 days. Perfect for busy households.",
    saving: "Save 15%",
    savingBg: "bg-blue-50 text-blue-700",
  },
  {
    icon: Repeat,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    title: "Bi-weekly",
    desc: "Every two weeks — the most popular choice for Cape Town families.",
    saving: "Save 10%",
    savingBg: "bg-violet-50 text-violet-700",
    popular: true,
  },
  {
    icon: Calendar,
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
    title: "Monthly",
    desc: "Once a month for a thorough refresh of your whole home.",
    saving: "Save 5%",
    savingBg: "bg-teal-50 text-teal-700",
  },
];

const BENEFITS = [
  { icon: Clock, title: "Save time", desc: "No need to rebook — your cleaner arrives on schedule, every time." },
  { icon: Sparkles, title: "Same trusted cleaners", desc: "We try to send the same cleaner each visit so they know your home." },
  { icon: CalendarClock, title: "Flexible scheduling", desc: "Skip a visit, pause your plan, or cancel anytime with no penalties." },
  { icon: CheckCircle2, title: "Easy to manage", desc: "Control everything from your account — no phone calls needed." },
];

const FAQ_ITEMS = [
  { q: "Can I change my recurring day?", a: "Yes — contact us on WhatsApp and we'll adjust your schedule at no extra cost." },
  { q: "What if I need to skip a visit?", a: "You can skip the next occurrence directly from this page with one click." },
  { q: "How do I pause my plan?", a: "Hit the Pause button on your plan card. Resume anytime when you're ready." },
  { q: "Is there a contract?", a: "No contract — recurring plans are month-to-month and can be cancelled at any time." },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-semibold text-gray-900"
        onClick={() => setOpen((o) => !o)}
      >
        {q}
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        )}
      </button>
      {open ? <p className="pb-4 text-sm text-gray-500 leading-relaxed">{a}</p> : null}
    </div>
  );
}

export default function AccountRecurringPage() {
  const toast = useDashboardToast();
  const { user, loading: userLoading } = useUser();
  const [items, setItems] = useState<MeRecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) { setLoading(true); setError(null); }
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) { setError("Sign in to view recurring plans."); setItems([]); if (!silent) setLoading(false); return; }
    const res = await fetch("/api/me/recurring", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { ok?: boolean; items?: MeRecurringItem[]; error?: string };
    if (!res.ok) { setError(json.error ?? "Could not load recurring plans."); setItems([]); }
    else setItems(json.items ?? []);
    if (!silent) setLoading(false);
  }, []);

  const silentRefetch = useCallback(() => load({ silent: true }), [load]);
  useCustomerRecurringRealtime(user?.id, silentRefetch);

  useEffect(() => {
    if (userLoading) return;
    const tid = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(tid);
  }, [userLoading, load]);

  async function postAction(id: string, action: "pause" | "resume" | "cancel" | "skip") {
    if (action === "cancel" && !window.confirm("Cancel this plan? Future visits will not be scheduled.")) return;
    if (action === "skip" && !window.confirm("Skip the next scheduled visit?")) return;
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) { toast("Sign in again.", "error"); return; }
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/recurring/${id}/${action}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { toast(json.error ?? "Something went wrong.", "error"); return; }
      toast(
        action === "cancel" ? "Plan cancelled."
          : action === "pause" ? "Plan paused."
            : action === "resume" ? "Plan resumed."
              : "Next visit skipped.",
        "success",
      );
      await load({ silent: true });
    } finally { setBusyId(null); }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded-xl bg-gray-100" />
        <div className="h-48 rounded-2xl bg-gray-100" />
        <div className="h-32 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  const todayYmd = todayYmdJohannesburg();
  const hasPlans = items.length > 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Recurring Plans</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your schedule, skip a visit, or pause anytime.
          </p>
        </div>
        <Button asChild className="rounded-xl bg-blue-600 px-5 text-white hover:bg-blue-700">
          <Link href="/account/book">
            <Sparkles className="mr-2 h-4 w-4" />
            Create recurring plan
          </Link>
        </Button>
      </div>

      {/* Error */}
      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}

      {/* Active plans */}
      {hasPlans ? (
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Your plans</h2>
          <ul className="space-y-4">
            {items.map((r) => {
              const st = r.status.toLowerCase();
              const canPause = st === "active";
              const canResume = st === "paused";
              const canCancel = st === "active" || st === "paused";
              const visitHm = formatHm(r.template_visit_time);
              const scheduleLine = [frequencyLabel(r.frequency), formatDays(r.days_of_week), visitHm ?? null].filter(Boolean).join(" · ");
              const skipQueued = Boolean(r.skip_next_occurrence_date?.trim());
              const canSkip = st === "active" && Boolean(r.next_run_date) && !skipQueued;
              const nextLine = nextCleaningLine(r, todayYmd);

              return (
                <li key={r.id}>
                  <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    {/* Plan header */}
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                            <Repeat className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{frequencyLabel(r.frequency)} clean</p>
                            <p className="text-xs text-gray-400 font-mono">{r.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Next cleaning highlight */}
                      {nextLine ? (
                        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                          <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" strokeWidth={1.75} />
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Next cleaning</p>
                            <p className="text-sm font-semibold text-blue-900">{nextLine}</p>
                          </div>
                        </div>
                      ) : null}

                      {/* Details grid */}
                      <div className="grid gap-4 sm:grid-cols-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Schedule</p>
                          <p className="text-gray-800">{scheduleLine || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Price per visit</p>
                          <p className="font-semibold tabular-nums text-gray-900">
                            R {Math.round(Number(r.price) || 0).toLocaleString("en-ZA")}
                          </p>
                        </div>
                        {r.start_date ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Started</p>
                            <p className="text-gray-800">{r.start_date}</p>
                          </div>
                        ) : null}
                      </div>

                      {/* Upcoming generated visits */}
                      {r.upcoming_bookings.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Upcoming visits
                          </p>
                          <div className="overflow-x-auto rounded-xl border border-gray-100">
                            <table className="w-full min-w-[300px] text-left text-xs">
                              <thead className="border-b border-gray-100 bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 font-semibold text-gray-500">Date</th>
                                  <th className="px-3 py-2 font-semibold text-gray-500">Time</th>
                                  <th className="px-3 py-2 font-semibold text-gray-500">Status</th>
                                  <th className="px-3 py-2 font-semibold text-gray-500">Payment</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.upcoming_bookings.map((b) => {
                                  const pay = formatPaymentStatusLabel(b.payment_status);
                                  return (
                                    <tr key={b.id} className="border-b border-gray-50 last:border-0">
                                      <td className="px-3 py-2 tabular-nums text-gray-700">{b.date ?? "—"}</td>
                                      <td className="px-3 py-2 tabular-nums text-gray-700">{formatHm(b.time) ?? "—"}</td>
                                      <td className="px-3 py-2 text-gray-700">{recurringVisitOperationalBadge(b)}</td>
                                      <td className={cn("px-3 py-2", paymentToneClass(pay.tone))}>{pay.label}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                        {canPause ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl gap-1.5"
                            disabled={busyId === r.id}
                            onClick={() => void postAction(r.id, "pause")}
                          >
                            <Pause className="h-3.5 w-3.5" />
                            Pause plan
                          </Button>
                        ) : null}
                        {canResume ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl gap-1.5"
                            disabled={busyId === r.id}
                            onClick={() => void postAction(r.id, "resume")}
                          >
                            <Play className="h-3.5 w-3.5" />
                            Resume plan
                          </Button>
                        ) : null}
                        {canSkip ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl gap-1.5"
                            disabled={busyId === r.id}
                            onClick={() => void postAction(r.id, "skip")}
                          >
                            <SkipForward className="h-3.5 w-3.5" />
                            Skip next visit
                          </Button>
                        ) : null}
                        {canCancel ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl gap-1.5 text-red-600 hover:border-red-200 hover:bg-red-50"
                            disabled={busyId === r.id}
                            onClick={() => void postAction(r.id, "cancel")}
                          >
                            <X className="h-3.5 w-3.5" />
                            Cancel plan
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        /* Empty state */
        <section>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Repeat className="h-8 w-8 text-blue-500" strokeWidth={1.5} />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-gray-900">No recurring plans yet</h2>
            <p className="mt-2 max-w-xs text-sm text-gray-500">
              Set up a recurring clean and never worry about booking again. Your cleaner arrives on the same schedule every time.
            </p>
            <Button asChild size="lg" className="mt-6 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
              <Link href="/account/book">
                <Sparkles className="mr-2 h-4 w-4" />
                Create your first plan
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* Popular plans */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Popular plans</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {POPULAR_PLANS.map(({ icon: Icon, iconBg, iconColor, title, desc, saving, savingBg, popular }) => (
            <div
              key={title}
              className={cn(
                "relative rounded-2xl border bg-white p-5 shadow-sm",
                popular ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-100",
              )}
            >
              {popular ? (
                <span className="absolute -top-2.5 left-4 rounded-full bg-blue-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Most popular
                </span>
              ) : null}
              <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", iconBg)}>
                <Icon className={cn("h-5 w-5", iconColor)} strokeWidth={1.75} />
              </div>
              <p className="mt-3 font-semibold text-gray-900">{title}</p>
              <p className="mt-1 text-sm text-gray-500">{desc}</p>
              <span className={cn("mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", savingBg)}>
                {saving}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Why go recurring?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <Icon className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{title}</p>
                <p className="mt-1 text-sm text-gray-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <HelpCircle className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Frequently asked questions</h2>
          </div>
          <div>
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Help card */}
      <HelpCard />
    </div>
  );
}
