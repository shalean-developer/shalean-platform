"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, KeyRound, PawPrint, PhoneCall, SquareParking } from "lucide-react";
import { getAdminToken } from "@/hooks/useAdminData";

type BookingInstructionSource = {
  service_details?: unknown;
  booking_snapshot?: unknown;
  access_instructions?: string | null;
  parking_instructions?: string | null;
  gate_code?: string | null;
};

type InstructionView = {
  specialInstructions: string | null;
  accessInstructions: string | null;
  parkingInstructions: string | null;
  gateCode: string | null;
  pets: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function extractOfficeBookingCustomerInstructions(booking: BookingInstructionSource): InstructionView {
  const serviceDetails = asRecord(booking.service_details);
  const snapshot = asRecord(booking.booking_snapshot);
  const snapshotServiceDetails = asRecord(snapshot?.serviceDetails ?? snapshot?.service_details);

  const specialInstructions =
    cleanText(serviceDetails?.specialInstructions) ??
    cleanText(serviceDetails?.special_instructions) ??
    cleanText(snapshotServiceDetails?.specialInstructions) ??
    cleanText(snapshotServiceDetails?.special_instructions) ??
    cleanText(snapshot?.customer_notes);

  const accessInstructions =
    cleanText(booking.access_instructions) ??
    cleanText(snapshot?.access_instructions) ??
    cleanText(snapshot?.accessInstructions);

  const parkingInstructions =
    cleanText(booking.parking_instructions) ??
    cleanText(snapshot?.parking_instructions) ??
    cleanText(snapshot?.parkingInstructions);

  const gateCode =
    cleanText(booking.gate_code) ??
    cleanText(snapshot?.gate_code) ??
    cleanText(snapshot?.gateCode);

  const petRaw =
    cleanText(serviceDetails?.hasPets) ??
    cleanText(serviceDetails?.has_pets) ??
    cleanText(snapshotServiceDetails?.hasPets) ??
    cleanText(snapshotServiceDetails?.has_pets);
  const pets = petRaw ? (petRaw.toLowerCase() === "yes" ? "Yes" : petRaw) : null;

  return { specialInstructions, accessInstructions, parkingInstructions, gateCode, pets };
}

export function OfficeBookingCustomerInstructionsBanner({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<BookingInstructionSource | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    const ac = new AbortController();

    void (async () => {
      try {
        const token = (await getAdminToken()) ?? undefined;
        if (!token || ac.signal.aborted) return;
        const res = await fetch(
          `/api/admin/bookings/${encodeURIComponent(bookingId)}/customer-instructions`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: ac.signal,
          },
        );
        if (!res.ok || ac.signal.aborted) return;
        const json = (await res.json()) as { booking?: BookingInstructionSource };
        if (!ac.signal.aborted) setBooking(json.booking ?? null);
      } catch {
        // The main booking view owns fatal load errors. This banner is intentionally non-blocking.
      }
    })();

    return () => ac.abort();
  }, [bookingId]);

  const instructions = useMemo(
    () => (booking ? extractOfficeBookingCustomerInstructions(booking) : null),
    [booking],
  );

  if (!instructions) return null;
  const hasAny = Boolean(
    instructions.specialInstructions ||
      instructions.accessInstructions ||
      instructions.parkingInstructions ||
      instructions.gateCode ||
      instructions.pets,
  );
  if (!hasAny) return null;

  return (
    <section
      className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 shadow-sm sm:px-5"
      aria-label="Customer instructions"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-100 p-2 text-amber-800">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div>
            <h2 className="font-semibold text-amber-950">Customer instructions — read before service</h2>
            <p className="mt-0.5 text-xs text-amber-800">
              Operational notes supplied by the customer. Visible to authorized Office staff.
            </p>
          </div>

          {instructions.specialInstructions ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Special cleaning instructions</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">
                {instructions.specialInstructions}
              </p>
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {instructions.accessInstructions ? (
              <InstructionChip icon={PhoneCall} label="Access" value={instructions.accessInstructions} />
            ) : null}
            {instructions.parkingInstructions ? (
              <InstructionChip icon={SquareParking} label="Parking" value={instructions.parkingInstructions} />
            ) : null}
            {instructions.gateCode ? (
              <InstructionChip icon={KeyRound} label="Gate / access code" value={instructions.gateCode} />
            ) : null}
            {instructions.pets ? <InstructionChip icon={PawPrint} label="Pets" value={instructions.pets} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function InstructionChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof PhoneCall;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
