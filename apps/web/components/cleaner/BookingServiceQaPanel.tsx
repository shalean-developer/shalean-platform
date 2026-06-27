"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import type { ServiceQaCleanerWire } from "@/lib/booking/bookingServiceQa";

const pickBtnClass =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-transparent px-3 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50";

function statusAllowsQaEdit(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return !["cancelled", "failed", "payment_expired"].includes(s);
}

export function BookingServiceQaPanel({
  bookingId,
  bookingStatus,
  serviceQa,
  onUpdated,
}: {
  bookingId: string;
  bookingStatus: string | null | undefined;
  serviceQa: ServiceQaCleanerWire;
  onUpdated: () => void;
}) {
  const [busySection, setBusySection] = useState<string | null>(null);
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const editable = statusAllowsQaEdit(bookingStatus);

  const patchChecklist = useCallback(
    async (section_key: string, completed: boolean) => {
      setErr(null);
      setBusySection(section_key);
      try {
        const headers = await getCleanerAuthHeaders();
        if (!headers) {
          setErr("Not signed in.");
          return;
        }
        const res = await cleanerAuthenticatedFetch(
          `/api/cleaner/jobs/${encodeURIComponent(bookingId)}/qa/checklist`,
          {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ section_key, completed }),
          },
        );
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? "Could not save checklist.");
          return;
        }
        onUpdated();
      } finally {
        setBusySection(null);
      }
    },
    [bookingId, onUpdated],
  );

  const uploadPhoto = useCallback(
    async (section_key: string, photo_type: "before" | "after", file: File) => {
      setErr(null);
      const key = `${section_key}:${photo_type}`;
      setBusyPhoto(key);
      try {
        const headers = await getCleanerAuthHeaders();
        if (!headers) {
          setErr("Not signed in.");
          return;
        }
        const form = new FormData();
        form.set("section_key", section_key);
        form.set("photo_type", photo_type);
        form.set("file", file);
        const res = await cleanerAuthenticatedFetch(
          `/api/cleaner/jobs/${encodeURIComponent(bookingId)}/qa/photos`,
          {
            method: "POST",
            headers,
            body: form,
          },
        );
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? "Could not upload photo.");
          return;
        }
        onUpdated();
      } finally {
        setBusyPhoto(null);
      }
    },
    [bookingId, onUpdated],
  );

  const photosBySection = new Map<string, ServiceQaCleanerWire["photos"]>();
  for (const p of serviceQa.photos) {
    const k = p.section_key;
    if (!photosBySection.has(k)) photosBySection.set(k, []);
    photosBySection.get(k)!.push(p);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Optional execution checklist for this premium job. Photos help support if there&apos;s a dispute — uploads are encouraged,
        not required.
      </p>
      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}
      <ul className="space-y-3">
        {serviceQa.checklist.map((row) => {
          const label = serviceQa.section_labels[row.section_key] ?? row.section_key;
          const loading = busySection === row.section_key;
          const sectionPhotos = photosBySection.get(row.section_key) ?? [];
          const beforeBusy = busyPhoto === `${row.section_key}:before`;
          const afterBusy = busyPhoto === `${row.section_key}:after`;
          return (
            <li
              key={row.section_key}
              className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id={`qa-${bookingId}-${row.section_key}`}
                  checked={row.completed}
                  disabled={!editable || loading}
                  onChange={(e) => void patchChecklist(row.section_key, e.target.checked)}
                  className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <label htmlFor={`qa-${bookingId}-${row.section_key}`} className="font-medium text-foreground">
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        {label}
                      </span>
                    ) : (
                      label
                    )}
                  </label>
                  {editable ? (
                    <div className="flex flex-wrap gap-2">
                      <label className={cn(pickBtnClass, beforeBusy && "opacity-70")}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={beforeBusy}
                          onChange={(ev) => {
                            const f = ev.target.files?.[0];
                            ev.target.value = "";
                            if (f) void uploadPhoto(row.section_key, "before", f);
                          }}
                        />
                        {beforeBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                        Before photo
                      </label>
                      <label className={cn(pickBtnClass, afterBusy && "opacity-70")}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={afterBusy}
                          onChange={(ev) => {
                            const f = ev.target.files?.[0];
                            ev.target.value = "";
                            if (f) void uploadPhoto(row.section_key, "after", f);
                          }}
                        />
                        {afterBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                        After photo
                      </label>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Checklist locked for this booking status.</p>
                  )}
                  {sectionPhotos.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {sectionPhotos.map((ph) => (
                        <div key={ph.id} className="relative">
                          {ph.signed_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs for MVP QA thumbnails
                            <img
                              src={ph.signed_url}
                              alt={`${ph.photo_type} ${label}`}
                              className="h-16 w-16 rounded-md border border-border object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 text-xs text-muted-foreground">
                              Link expired — refresh page
                            </span>
                          )}
                          <span className="absolute -bottom-1 left-0 rounded bg-background/90 px-1 text-xs font-medium uppercase text-muted-foreground shadow">
                            {ph.photo_type}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
