"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, LifeBuoy, RefreshCw } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type CustomerCase = {
  id: string;
  case_number: number;
  booking_id: string | null;
  category: string;
  priority: string;
  status: string;
  subject: string;
  first_response_due_at: string;
  resolution_due_at: string;
  first_responded_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_summary: string | null;
  created_at: string;
  updated_at: string;
};

function label(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusVariant(status: string): BadgeVariant {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "waiting_customer") return "warning";
  return "default";
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

function CaseMetric({ labelText, value }: { labelText: string; value: string | number }) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{labelText}</p>
        <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function AccountCasesPage() {
  const [cases, setCases] = useState<CustomerCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/customer/cases", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => ({}))) as { cases?: CustomerCase[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load support cases.");
      setCases(body.cases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load support cases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = useMemo(
    () => cases.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    [cases],
  );

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Support cases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track complaints, billing issues, refunds and service-recovery cases in one place.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="w-full shrink-0 sm:w-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      </header>

      <section aria-label="Support case overview" className="grid gap-3 sm:grid-cols-2">
        <CaseMetric labelText="Open cases" value={loading ? "—" : openCount} />
        <CaseMetric labelText="Total cases" value={loading ? "—" : cases.length} />
      </section>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5" role="alert">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm text-foreground">{error}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="w-full sm:w-auto">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-4" aria-hidden>
          {[0, 1].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-[var(--ui-radius-lg)] border border-border bg-card" />
          ))}
        </div>
      ) : null}

      {!loading && !error && cases.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <LifeBuoy className="h-7 w-7" aria-hidden />
            </div>
            <p className="mt-4 font-semibold text-foreground">No support cases</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              If you need help with a booking, contact Customer Care and any formal case will appear here.
            </p>
            <Button asChild className="mt-4">
              <Link href="/account/help">Contact support</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {cases.map((item) => {
            const done = item.status === "resolved" || item.status === "closed";
            return (
              <Card key={item.id} className="overflow-hidden">
                <CardHeader className="border-b border-border pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="break-words text-base">
                        Case #{item.case_number}: {item.subject}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {label(item.category)} · Opened {formatWhen(item.created_at)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(item.status)} className="w-fit shrink-0">
                      {label(item.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-5 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-muted p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">First response</p>
                      <p className="mt-1 flex items-start gap-2 text-foreground">
                        {item.first_responded_at ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                        ) : (
                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                        )}
                        <span>
                          {item.first_responded_at
                            ? formatWhen(item.first_responded_at)
                            : `Due ${formatWhen(item.first_response_due_at)}`}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resolution</p>
                      <p className="mt-1 text-foreground">
                        {done
                          ? formatWhen(item.resolved_at ?? item.closed_at)
                          : `Due ${formatWhen(item.resolution_due_at)}`}
                      </p>
                    </div>
                  </div>

                  {item.resolution_summary ? (
                    <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-success">Resolution</p>
                      <p className="mt-1 break-words text-foreground">{item.resolution_summary}</p>
                    </div>
                  ) : null}

                  {item.booking_id ? (
                    <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                      <Link href={`/account/bookings/${item.booking_id}`}>View related booking</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
