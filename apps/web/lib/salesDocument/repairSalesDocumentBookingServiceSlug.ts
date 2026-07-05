import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel, parseBookingServiceId } from "@/components/booking/serviceCategories";
import { resolveSalesDocumentBookingServiceSlug } from "@/lib/salesDocument/resolveSalesDocumentBookingServiceSlug";
import type { SalesDocumentLineItem } from "@/lib/salesDocument/types";

export type RepairSalesDocumentBookingServiceResult =
  | { ok: true; updated: false; serviceSlug: string }
  | { ok: true; updated: true; serviceSlug: string; previousSlug: string }
  | { ok: false; error: string };

function parseLineItems(raw: unknown): SalesDocumentLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row) => row && typeof row === "object") as SalesDocumentLineItem[];
}

function patchBookingSnapshots(
  bookingSnapshot: unknown,
  priceSnapshot: unknown,
  serviceSlug: string,
): { booking_snapshot: unknown; price_snapshot: unknown } {
  let nextBookingSnapshot = bookingSnapshot;
  if (bookingSnapshot && typeof bookingSnapshot === "object" && !Array.isArray(bookingSnapshot)) {
    const snap = bookingSnapshot as Record<string, unknown>;
    const flat =
      snap.flat && typeof snap.flat === "object" && !Array.isArray(snap.flat)
        ? { ...(snap.flat as Record<string, unknown>), service: serviceSlug }
        : { service: serviceSlug };
    nextBookingSnapshot = { ...snap, flat };
  }

  let nextPriceSnapshot = priceSnapshot;
  if (priceSnapshot && typeof priceSnapshot === "object" && !Array.isArray(priceSnapshot)) {
    nextPriceSnapshot = { ...(priceSnapshot as Record<string, unknown>), service_type: serviceSlug };
  }

  return { booking_snapshot: nextBookingSnapshot, price_snapshot: nextPriceSnapshot };
}

/**
 * Re-derive `service_slug` / labels from the linked sales document when admin quotes omitted `request_details`.
 */
export async function repairSalesDocumentBookingServiceSlug(
  admin: SupabaseClient,
  bookingId: string,
): Promise<RepairSalesDocumentBookingServiceResult> {
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, service_slug, service, sales_document_id, booking_snapshot, price_snapshot")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr) return { ok: false, error: bookingErr.message };
  if (!booking?.id) return { ok: false, error: "booking_not_found" };

  const salesDocumentId = String((booking as { sales_document_id?: string | null }).sales_document_id ?? "").trim();
  if (!salesDocumentId) return { ok: false, error: "not_sales_document_booking" };

  const { data: doc, error: docErr } = await admin
    .from("sales_documents")
    .select("id, line_items, request_details, converted_from_id")
    .eq("id", salesDocumentId)
    .maybeSingle();

  if (docErr) return { ok: false, error: docErr.message };
  if (!doc) return { ok: false, error: "sales_document_not_found" };

  let requestDetails = (doc as { request_details?: unknown }).request_details ?? null;
  let lineItems = parseLineItems((doc as { line_items?: unknown }).line_items);

  const convertedFrom = String((doc as { converted_from_id?: string | null }).converted_from_id ?? "").trim();
  if (convertedFrom) {
    const { data: quote } = await admin
      .from("sales_documents")
      .select("line_items, request_details")
      .eq("id", convertedFrom)
      .maybeSingle();
    if (quote) {
      if (!requestDetails) requestDetails = (quote as { request_details?: unknown }).request_details ?? null;
      if (!lineItems.length) lineItems = parseLineItems((quote as { line_items?: unknown }).line_items);
    }
  }

  const serviceSlug = resolveSalesDocumentBookingServiceSlug({
    requestDetails: requestDetails as Parameters<typeof resolveSalesDocumentBookingServiceSlug>[0]["requestDetails"],
    lineItems,
  });

  const previousSlug = String((booking as { service_slug?: string | null }).service_slug ?? "standard").trim() || "standard";
  if (previousSlug === serviceSlug) {
    return { ok: true, updated: false, serviceSlug };
  }

  const serviceId = parseBookingServiceId(serviceSlug) ?? "standard";
  const { booking_snapshot, price_snapshot } = patchBookingSnapshots(
    (booking as { booking_snapshot?: unknown }).booking_snapshot,
    (booking as { price_snapshot?: unknown }).price_snapshot,
    serviceSlug,
  );

  const { error: upErr } = await admin
    .from("bookings")
    .update({
      service_slug: serviceSlug,
      service: getServiceLabel(serviceId),
      booking_snapshot,
      price_snapshot,
    })
    .eq("id", bookingId);

  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, updated: true, serviceSlug, previousSlug };
}
