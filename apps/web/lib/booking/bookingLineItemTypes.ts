/** Row shape for `public.booking_line_items` (ZAR minor units = cents, 1 ZAR = 100). */
export type BookingLineItemRow = {
  booking_id: string;
  item_type: "base" | "room" | "bathroom" | "extra" | "adjustment";
  slug: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  pricing_source: string | null;
  metadata: Record<string, unknown>;
};

export type BookingLineItemInsert = Omit<BookingLineItemRow, "booking_id">;
