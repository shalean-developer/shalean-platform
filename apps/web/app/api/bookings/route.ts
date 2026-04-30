export const runtime = "nodejs";

const mockBookings = [
  {
    id: "mock-1",
    serviceType: "standard",
    scheduledAt: "2026-05-01T09:00:00.000Z",
    status: "confirmed",
    cleanerId: null as string | null,
    dispatchStatus: "assigned" as string | null,
  },
  {
    id: "mock-2",
    serviceType: "deep",
    scheduledAt: "2026-05-03T14:00:00.000Z",
    status: "pending",
    cleanerId: null as string | null,
    dispatchStatus: "searching" as string | null,
  },
];

export async function GET() {
  return Response.json({
    success: true,
    bookings: mockBookings,
  });
}

const DEPRECATION_HEADERS = {
  "X-API-Deprecation":
    "POST /api/bookings is retired. Use POST /api/booking/widget-quote for widget/conversion quotes; use /booking for customer checkout.",
};

/**
 * Legacy intake and dry-run quote previously lived here. All creates and quotes use dedicated routes
 * (`createBookingUnified` / `insertBookingRowUnified`, `/api/booking/widget-quote`, Paystack pipeline).
 */
export async function POST() {
  return Response.json(
    {
      success: false,
      error:
        "POST /api/bookings is retired. Use POST /api/booking/widget-quote for conversion/widget quotes, or /booking for customer checkout.",
      migration: {
        widgetQuote: "/api/booking/widget-quote",
        checkout: "/booking",
      },
    },
    { status: 410, headers: DEPRECATION_HEADERS },
  );
}
