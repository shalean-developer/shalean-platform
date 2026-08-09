"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Pencil, Phone, Star, User } from "lucide-react";
import { OfficeCleanerEditPanel } from "@/components/admin/office/OfficeCleanerEditPanel";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

type CleanerDetail = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  jobs_completed: number | null;
  status: string | null;
  is_available: boolean | null;
  is_active: boolean | null;
  location: string | null;
  availability_start: string | null;
  availability_end: string | null;
  availability_weekdays: string[] | null;
  auth_user_id: string | null;
};

type CleanerDetailResponse = {
  cleaner: CleanerDetail;
  assignedBookings: Array<{
    id: string;
    booking_reference: string | null;
    service: string | null;
    date: string | null;
    time: string | null;
    status: string | null;
    location: string | null;
  }>;
};

const CLEANER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function workloadLabel(status: string | null, isAvailable: boolean | null): string {
  const st = String(status ?? "").toLowerCase();
  if (st === "offline" || isAvailable === false) return "Not receiving offers";
  if (st === "busy") return "On a job";
  return "Available for dispatch";
}

function workloadClass(status: string | null, isAvailable: boolean | null): string {
  const st = String(status ?? "").toLowerCase();
  if (st === "offline" || isAvailable === false) return "bg-slate-100 text-slate-700";
  if (st === "busy") return "bg-blue-100 text-blue-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function OfficeCleanerDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
          <div className="h-6 w-48 animate-pulse rounded-lg bg-slate-100" />
        </div>
      }
    >
      <OfficeCleanerDetailContent />
    </Suspense>
  );
}

function OfficeCleanerDetailContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const cleanerId = typeof params?.id === "string" ? params.id : "";
  const isValidCleanerId = CLEANER_UUID_RE.test(cleanerId);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");

  useEffect(() => {
    setEditing(searchParams.get("edit") === "1");
  }, [searchParams]);

  const { data, loading, error, refetch } = useAdminData<CleanerDetailResponse>(
    isValidCleanerId ? `/api/admin/cleaners/${encodeURIComponent(cleanerId)}` : "",
    { enabled: isValidCleanerId },
  );

  const cleaner = data?.cleaner;
  const assignedBookings = data?.assignedBookings ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/office/cleaners"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Back to cleaners"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{cleaner?.full_name ?? "Cleaner profile"}</h1>
            <p className="mt-0.5 text-sm text-slate-500">Individual cleaner profile and workload status.</p>
          </div>
        </div>
        {cleaner ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
              editing
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            <Pencil className="h-4 w-4" />
            {editing ? "Hide editor" : "Edit cleaner"}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
          <div className="h-6 w-48 animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-4 h-4 w-full max-w-md animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : !cleaner ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-sm text-slate-500 shadow-sm">
          Cleaner not found.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-lg font-bold text-blue-700">
                {(cleaner.full_name ?? "?")
                  .split(" ")
                  .map((part) => part[0] ?? "")
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900">{cleaner.full_name ?? "Unnamed cleaner"}</h2>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold",
                      workloadClass(cleaner.status, cleaner.is_available),
                    )}
                  >
                    {workloadLabel(cleaner.status, cleaner.is_available)}
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", cleaner.is_active === false ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>
                    {cleaner.is_active === false ? "Archived" : "Active roster"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">{cleaner.id}</p>
              </div>
            </div>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Phone className="h-3.5 w-3.5" /> Phone
                </dt>
                <dd className="mt-2 text-sm font-medium text-slate-800">{cleaner.phone ?? "—"}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Mail className="h-3.5 w-3.5" /> Email
                </dt>
                <dd className="mt-2 break-all text-sm font-medium text-slate-800">{cleaner.email ?? "—"}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> Location
                </dt>
                <dd className="mt-2 text-sm font-medium text-slate-800">{cleaner.location ?? "—"}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <User className="h-3.5 w-3.5" /> Auth
                </dt>
                <dd className="mt-2 text-sm font-medium text-slate-800">
                  {cleaner.auth_user_id ? "Linked" : "Not linked"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Assigned jobs</h2>
                <p className="mt-1 text-sm text-slate-500">Recent assignments from the canonical booking and team roster.</p>
              </div>
              <Link href="/office/bookings" className="text-sm font-semibold text-blue-600 hover:underline">
                Open bookings
              </Link>
            </div>
            {assignedBookings.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No assigned bookings found.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Booking</th>
                      <th className="px-3 py-2">Service</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignedBookings.map((booking) => (
                      <tr key={booking.id}>
                        <td className="px-3 py-3 font-semibold text-blue-700">{booking.booking_reference ?? booking.id.slice(0, 8)}</td>
                        <td className="px-3 py-3 capitalize text-slate-700">{booking.service ?? "—"}</td>
                        <td className="px-3 py-3 text-slate-700">{booking.date ?? "—"}{booking.time ? ` · ${booking.time.slice(0, 5)}` : ""}</td>
                        <td className="px-3 py-3 capitalize text-slate-700">{booking.status ?? "—"}</td>
                        <td className="px-3 py-3 text-slate-700">{booking.location ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            {editing ? (
              <OfficeCleanerEditPanel
                cleaner={cleaner}
                onSaved={() => void refetch()}
                onCancel={() => setEditing(false)}
              />
            ) : null}

            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800">Performance</h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Rating</span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {cleaner.rating != null ? Number(cleaner.rating).toFixed(1) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Jobs completed</span>
                  <span className="text-sm font-semibold text-slate-800">{cleaner.jobs_completed ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Workload status</span>
                  <span className="text-sm font-semibold capitalize text-slate-800">{cleaner.status ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Receiving offers</span>
                  <span className="text-sm font-semibold text-slate-800">{cleaner.is_available ? "Yes" : "No"}</span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800">Schedule summary</h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Hours</dt>
                  <dd className="font-medium text-slate-800">
                    {cleaner.availability_start && cleaner.availability_end
                      ? `${cleaner.availability_start.slice(0, 5)} – ${cleaner.availability_end.slice(0, 5)}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Working days</dt>
                  <dd className="mt-1 font-medium capitalize text-slate-800">
                    {cleaner.availability_weekdays?.length ? cleaner.availability_weekdays.join(", ") : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                <Pencil className="h-4 w-4" />
                Edit cleaner
              </button>
            ) : null}

            <Link
              href="/office/cleaners"
              className="block rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              Back to all cleaners
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
