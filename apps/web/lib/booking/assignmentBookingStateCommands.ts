import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignmentBookingUpdateError = { message: string; code?: string };

export async function assignPendingBookingCleaner(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
}): Promise<{ error: AssignmentBookingUpdateError | null }> {
  const { error } = await params.admin
    .from("bookings")
    .update(params.patch)
    .eq("id", params.bookingId)
    .eq("status", "pending")
    .is("cleaner_id", null);

  return { error };
}

export async function updateBookingAssignmentLocationContext(params: {
  admin: SupabaseClient;
  bookingId: string;
  locationId: string;
  cityId: string | null;
}): Promise<{ error: AssignmentBookingUpdateError | null }> {
  const { error } = await params.admin
    .from("bookings")
    .update({ location_id: params.locationId, city_id: params.cityId })
    .eq("id", params.bookingId);

  return { error };
}

export async function reassignPendingAssignmentBookingAfterDecline(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
  select: string;
}): Promise<{ data: unknown | null; error: AssignmentBookingUpdateError | null }> {
  const { data, error } = await params.admin
    .from("bookings")
    .update(params.patch)
    .eq("id", params.bookingId)
    .eq("status", "pending_assignment")
    .is("cleaner_id", null)
    .select(params.select)
    .maybeSingle();

  return { data: data ?? null, error };
}

export async function releaseAssignedBookingAfterAckTimeout(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
}): Promise<{ data: { id?: string } | null; error: AssignmentBookingUpdateError | null }> {
  const { data, error } = await params.admin
    .from("bookings")
    .update(params.patch)
    .eq("id", params.bookingId)
    .eq("status", "assigned")
    .select("id")
    .maybeSingle();

  return { data: data as { id?: string } | null, error };
}

export async function failBookingAfterAckEscalationExhausted(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
  cleanerResponseStatus: string;
}): Promise<{ error: AssignmentBookingUpdateError | null }> {
  const { error } = await params.admin
    .from("bookings")
    .update(params.patch)
    .eq("id", params.bookingId)
    .eq("cleaner_response_status", params.cleanerResponseStatus);

  return { error };
}

export async function clearBookingForAckEscalationRedispatch(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
  cleanerResponseStatus: string;
}): Promise<{ data: Array<{ id: string }> | null; error: AssignmentBookingUpdateError | null }> {
  const { data, error } = await params.admin
    .from("bookings")
    .update(params.patch)
    .eq("id", params.bookingId)
    .eq("cleaner_response_status", params.cleanerResponseStatus)
    .select("id");

  return { data: data as Array<{ id: string }> | null, error };
}

export async function markRedispatchMaxAttemptsFailed(params: {
  admin: SupabaseClient;
  bookingId: string;
  eligibleStatuses: readonly string[];
}): Promise<{ error: AssignmentBookingUpdateError | null }> {
  const { error } = await params.admin
    .from("bookings")
    .update({ dispatch_status: "failed" })
    .eq("id", params.bookingId)
    .in("status", [...params.eligibleStatuses])
    .is("cleaner_id", null);

  return { error };
}

export async function bumpRedispatchAttemptForBooking(params: {
  admin: SupabaseClient;
  bookingId: string;
  eligibleStatuses: readonly string[];
  expectedAttempts: number;
  nextAttempts: number;
}): Promise<{ data: { id?: string } | null; error: AssignmentBookingUpdateError | null }> {
  const { data, error } = await params.admin
    .from("bookings")
    .update({ dispatch_status: "searching", dispatch_attempt_count: params.nextAttempts })
    .eq("id", params.bookingId)
    .in("status", [...params.eligibleStatuses])
    .is("cleaner_id", null)
    .eq("dispatch_attempt_count", params.expectedAttempts)
    .select("id")
    .maybeSingle();

  return { data: data as { id?: string } | null, error };
}

export async function markBookingPaymentNeedsFollowUp(params: {
  admin: SupabaseClient;
  bookingId: string;
}): Promise<void> {
  await params.admin.from("bookings").update({ payment_needs_follow_up: true }).eq("id", params.bookingId);
}

export async function tagUserSelectedRedispatchFallback(params: {
  admin: SupabaseClient;
  bookingId: string;
  reassignmentReason: string;
  attemptedCleanerId: string;
}): Promise<{ error: AssignmentBookingUpdateError | null }> {
  const { error } = await params.admin
    .from("bookings")
    .update({
      assignment_type: "auto_fallback",
      fallback_reason: params.reassignmentReason,
      attempted_cleaner_id: params.attemptedCleanerId,
    })
    .eq("id", params.bookingId);

  return { error };
}

export async function scheduleRedispatchRecoveryBackoff(params: {
  admin: SupabaseClient;
  bookingId: string;
  nextRecoveryIso: string | null;
}): Promise<{ error: AssignmentBookingUpdateError | null }> {
  const { error } = await params.admin
    .from("bookings")
    .update({
      dispatch_next_recovery_at: params.nextRecoveryIso,
      dispatch_recovery_lease_until: null,
    })
    .eq("id", params.bookingId);

  return { error };
}

export async function markDispatchRetryTerminalBookingStatus(params: {
  admin: SupabaseClient;
  bookingId: string;
  terminalDispatchStatus: string;
}): Promise<void> {
  await params.admin
    .from("bookings")
    .update({ dispatch_status: params.terminalDispatchStatus })
    .eq("id", params.bookingId)
    .in("status", ["pending", "pending_assignment"])
    .is("cleaner_id", null);
}

export async function markDispatchOfferCapUnassignable(params: {
  admin: SupabaseClient;
  bookingId: string;
}): Promise<{ error: AssignmentBookingUpdateError | null }> {
  const { error } = await params.admin
    .from("bookings")
    .update({ dispatch_status: "unassignable" })
    .eq("id", params.bookingId)
    .in("status", ["pending", "pending_assignment"])
    .is("cleaner_id", null);

  return { error };
}

export async function markDispatchExpiredWhenNoPendingOffers(params: {
  admin: SupabaseClient;
  bookingId: string;
}): Promise<void> {
  await params.admin.from("bookings").update({ dispatch_status: "expired" }).eq("id", params.bookingId);
}

export async function markSmartDispatchSearching(params: {
  admin: SupabaseClient;
  bookingId: string;
}): Promise<void> {
  await params.admin.from("bookings").update({ dispatch_status: "searching" }).eq("id", params.bookingId);
}

export async function markSmartDispatchFailed(params: {
  admin: SupabaseClient;
  bookingId: string;
}): Promise<void> {
  await params.admin.from("bookings").update({ dispatch_status: "failed" }).eq("id", params.bookingId);
}
