import "server-only";

import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import { mergeRecurringTemplateConvenience } from "@/lib/recurring/mergeRecurringTemplateConvenience";
import { recurringPatchFieldsFromBody } from "@/lib/recurring/recurringPatchFromBody";

/**
 * Admin PATCH body → DB patch, including convenience fields that update `booking_snapshot_template`.
 */
export function recurringAdminPatchFromBody(
  body: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const patch = recurringPatchFieldsFromBody(body);

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const visitTime = typeof body.visit_time === "string" ? body.visit_time.trim() : "";
  const serviceRaw = typeof body.service === "string" ? body.service.trim() : "";
  const parsedService = serviceRaw ? parseBookingServiceId(serviceRaw) : null;
  const price =
    typeof body.price === "number" && Number.isFinite(body.price) ? Math.round(body.price) : undefined;

  const convenience: Parameters<typeof mergeRecurringTemplateConvenience>[1] = {};
  if (address) convenience.address = address;
  if (visitTime) convenience.visit_time = visitTime;
  if (parsedService && ["standard", "deep", "move"].includes(parsedService)) {
    convenience.service = parsedService;
  }
  if (price !== undefined && price >= 0) convenience.price = price;

  if (Object.keys(convenience).length > 0) {
    const merged = mergeRecurringTemplateConvenience(existing.booking_snapshot_template, convenience);
    if (merged) patch.booking_snapshot_template = merged;
  }

  return patch;
}
