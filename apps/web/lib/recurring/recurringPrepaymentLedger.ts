import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allocateRecurringPrepayment,
  type RecurringPrepaymentQuote,
} from "@/lib/recurring/recurringPrepayment";

export async function upsertPendingRecurringPrepayment(
  admin: SupabaseClient,
  input: {
    sourceBookingId: string;
    recurringId?: string | null;
    customerId: string;
    paystackReference: string;
    quote: RecurringPrepaymentQuote;
    paidPackageZar: number;
  },
): Promise<{ ok: true; packageId: string } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("recurring_prepaid_packages")
    .upsert({
      source_booking_id: input.sourceBookingId,
      ...(input.recurringId ? { recurring_id: input.recurringId } : {}),
      customer_id: input.customerId,
      paystack_reference: input.paystackReference,
      coverage_start_date: input.quote.coverageStartDate,
      coverage_end_date: input.quote.coverageEndDate,
      occurrence_dates: input.quote.occurrenceDates,
      visit_count: input.quote.visitCount,
      per_visit_price_zar: input.quote.perVisitZar,
      gross_package_zar: input.quote.grossPackageZar,
      paid_package_zar: Math.max(0, Math.round(input.paidPackageZar)),
      status: "pending_payment",
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_booking_id" })
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, error: error?.message ?? "package_upsert_failed" };
  return { ok: true, packageId: String(data.id) };
}

export async function discardPendingRecurringPrepaymentForBooking(
  admin: SupabaseClient,
  sourceBookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from("recurring_prepaid_packages")
    .delete()
    .eq("source_booking_id", sourceBookingId)
    .eq("status", "pending_payment");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function syncRecurringPrepaymentReference(
  admin: SupabaseClient,
  sourceBookingId: string,
  paystackReference: string,
): Promise<void> {
  await admin
    .from("recurring_prepaid_packages")
    .update({ paystack_reference: paystackReference, updated_at: new Date().toISOString() })
    .eq("source_booking_id", sourceBookingId)
    .eq("status", "pending_payment");
}

export async function activateRecurringPrepayment(
  admin: SupabaseClient,
  input: {
    sourceBookingId: string;
    recurringId: string;
    paidPackageZar: number;
    paidAt: string;
  },
): Promise<{ ok: true; packageId: string; sourceAllocatedZar: number } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("recurring_prepaid_packages")
    .select("id, occurrence_dates, per_visit_price_zar, status")
    .eq("source_booking_id", input.sourceBookingId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "prepayment_package_not_found" };

  const packageId = String(data.id);
  if (data.status === "active" || data.status === "exhausted") {
    const { data: sourceAllocation, error: sourceError } = await admin
      .from("recurring_prepaid_allocations")
      .select("allocated_zar")
      .eq("package_id", packageId)
      .eq("booking_id", input.sourceBookingId)
      .maybeSingle();
    if (sourceError) return { ok: false, error: sourceError.message };
    return {
      ok: true,
      packageId,
      sourceAllocatedZar: Math.max(0, Math.round(Number(sourceAllocation?.allocated_zar ?? 0))),
    };
  }
  const dates = Array.isArray(data.occurrence_dates)
    ? data.occurrence_dates.map(String)
    : [];
  const allocations = allocateRecurringPrepayment({
    occurrenceDates: dates,
    perVisitZar: Number(data.per_visit_price_zar ?? 0),
    packagePayableZar: input.paidPackageZar,
  });
  if (allocations.length === 0) return { ok: false, error: "prepayment_allocations_empty" };

  const sourceDate = allocations[0]?.occurrenceDate;
  const rows = allocations.map((allocation) => ({
    package_id: packageId,
    booking_id: allocation.occurrenceDate === sourceDate ? input.sourceBookingId : null,
    occurrence_date: allocation.occurrenceDate,
    allocated_zar: allocation.allocatedZar,
    status: allocation.occurrenceDate === sourceDate ? "applied" : "reserved",
    applied_at: allocation.occurrenceDate === sourceDate ? input.paidAt : null,
    updated_at: new Date().toISOString(),
  }));
  const { error: allocationError } = await admin
    .from("recurring_prepaid_allocations")
    .upsert(rows, { onConflict: "package_id,occurrence_date" });
  if (allocationError) return { ok: false, error: allocationError.message };

  const { error: packageError } = await admin
    .from("recurring_prepaid_packages")
    .update({
      recurring_id: input.recurringId,
      paid_package_zar: Math.max(0, Math.round(input.paidPackageZar)),
      status: "active",
      payment_completed_at: input.paidAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", packageId);
  if (packageError) return { ok: false, error: packageError.message };

  return {
    ok: true,
    packageId,
    sourceAllocatedZar: allocations[0]?.allocatedZar ?? 0,
  };
}

export type ReservedRecurringPrepaymentAllocation = {
  allocationId: string;
  packageId: string;
  allocatedZar: number;
  paidAt: string;
};

export async function findRecurringPrepaymentCycleForDate(
  admin: SupabaseClient,
  recurringId: string,
  occurrenceDate: string,
): Promise<{ packageId: string; status: string } | null> {
  const { data, error } = await admin
    .from("recurring_prepaid_packages")
    .select("id, status")
    .eq("recurring_id", recurringId)
    .contains("occurrence_dates", [occurrenceDate])
    .in("status", ["pending_payment", "active", "exhausted"])
    .order("coverage_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return null;
  return { packageId: String(data.id), status: String(data.status ?? "") };
}

export async function findReservedRecurringPrepaymentAllocation(
  admin: SupabaseClient,
  recurringId: string,
  occurrenceDate: string,
): Promise<ReservedRecurringPrepaymentAllocation | null> {
  const { data, error } = await admin
    .from("recurring_prepaid_allocations")
    .select("id, package_id, allocated_zar, recurring_prepaid_packages!inner(recurring_id, status, payment_completed_at)")
    .eq("occurrence_date", occurrenceDate)
    .eq("status", "reserved")
    .eq("recurring_prepaid_packages.recurring_id", recurringId)
    .eq("recurring_prepaid_packages.status", "active")
    .maybeSingle();
  if (error || !data) return null;
  const packageRow = Array.isArray(data.recurring_prepaid_packages)
    ? data.recurring_prepaid_packages[0]
    : data.recurring_prepaid_packages;
  const paidAt = packageRow && typeof packageRow === "object"
    ? String((packageRow as { payment_completed_at?: unknown }).payment_completed_at ?? "")
    : "";
  if (!paidAt) return null;
  return {
    allocationId: String(data.id),
    packageId: String(data.package_id),
    allocatedZar: Math.max(0, Math.round(Number(data.allocated_zar ?? 0))),
    paidAt,
  };
}

export async function applyReservedRecurringPrepaymentAllocation(
  admin: SupabaseClient,
  input: { allocationId: string; bookingId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("recurring_prepaid_allocations")
    .update({
      booking_id: input.bookingId,
      status: "applied",
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.allocationId)
    .eq("status", "reserved")
    .is("booking_id", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "prepayment_allocation_claim_failed" };
  return { ok: true };
}
