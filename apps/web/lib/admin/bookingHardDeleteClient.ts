import {
  assertAdminBookingDeleteSafe,
  type AdminBookingDeleteSafetyRow,
} from "@/lib/admin/adminBookingDeleteSafety";

export function canHardDeleteBooking(row: AdminBookingDeleteSafetyRow): boolean {
  return assertAdminBookingDeleteSafe(row).ok;
}

export function hardDeleteBlockReason(row: AdminBookingDeleteSafetyRow): string | null {
  const result = assertAdminBookingDeleteSafe(row);
  return result.ok ? null : result.error;
}
