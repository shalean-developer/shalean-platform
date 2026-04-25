"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, MapPin, Navigation, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { getCleanerIdHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { bookingRowToMobileView, deriveMobilePhase } from "@/lib/cleaner/cleanerMobileBookingMap";
import { TEAM_JOB_ROLE_SUBTEXT, teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";

export default function CleanerJobDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [row, setRow] = useState<CleanerBookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = getCleanerIdHeaders();
    if (!headers || !id) {
      setError("Not signed in.");
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/cleaner/jobs/${encodeURIComponent(id)}`, { headers });
    const json = (await res.json()) as { job?: CleanerBookingRow; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Could not load job.");
      setRow(null);
      return;
    }
    setError(null);
    setRow(json.job ?? null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-zinc-50 p-4 dark:bg-zinc-950">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-4 h-64 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-zinc-50 dark:bg-zinc-950">
        <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <Link
            href="/cleaner/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </Link>
        </header>
        <div className="p-4">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
              {error ?? "Job not found."}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const view = bookingRowToMobileView(row);
  const phase = deriveMobilePhase(row);
  const statusLabel =
    phase === "completed"
      ? "Completed"
      : phase === "in_progress"
        ? "In progress"
        : phase === "en_route"
          ? "On the way"
          : "Assigned";

  const tel = view.phone.replace(/\s/g, "");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(view.address)}`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/cleaner/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Job details</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{statusLabel}</Badge>
              {row.is_team_job ? (
                <Badge variant="outline" className="font-normal">
                  Team job
                </Badge>
              ) : null}
            </div>
            {row.is_team_job ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/90 px-3 py-2.5 text-sm dark:border-blue-900/50 dark:bg-blue-950/35">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {teamJobAssignmentHeadline(
                    typeof row.teamMemberCount === "number" ? row.teamMemberCount : null,
                  )}
                </p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{TEAM_JOB_ROLE_SUBTEXT}</p>
              </div>
            ) : null}
            <div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{view.customerName}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{view.service}</p>
            </div>
            <div className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
              <span>{view.address}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/80">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Date</p>
                <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{view.date || "—"}</p>
              </div>
              <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/80">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Time</p>
                <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{view.time}</p>
              </div>
            </div>
            {view.notes ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="text-xs font-semibold uppercase text-zinc-500">Notes</p>
                <p className="mt-1 text-zinc-800 dark:text-zinc-100">{view.notes}</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2 pt-2">
              {tel ? (
                <Button size="lg" className="h-12 w-full rounded-xl text-base" asChild>
                  <a href={`tel:${tel}`}>
                    <Phone className="h-4 w-4" aria-hidden />
                    Call customer
                  </a>
                </Button>
              ) : null}
              <Button variant="outline" size="lg" className="h-12 w-full rounded-xl text-base" asChild>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="h-4 w-4" aria-hidden />
                  Open directions
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
