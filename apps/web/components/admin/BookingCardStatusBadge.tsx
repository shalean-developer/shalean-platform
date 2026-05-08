"use client";

import { useMemo } from "react";
import type { AdminBookingsListRow } from "@/lib/admin/adminBookingsListRow";
import { adminBookingsListRowToOperationalRecord } from "@/lib/admin/adminBookingOperationalRecord";
import {
  describeBookingOperationalState,
  operationalDisplayBadgeClassName,
} from "@/lib/booking/describeBookingOperationalState";

export function BookingCardStatusBadge({ row }: { row: AdminBookingsListRow }) {
  const op = useMemo(
    () =>
      describeBookingOperationalState({
        row: adminBookingsListRowToOperationalRecord(row),
        viewer: "admin",
      }),
    [row],
  );
  const cls = operationalDisplayBadgeClassName(op.displayTone);
  return (
    <span
      className={["inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", cls].join(" ")}
      title={op.displayBadge}
    >
      {op.displayBadge}
    </span>
  );
}
