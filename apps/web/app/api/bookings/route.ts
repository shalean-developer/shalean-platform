export const runtime = "nodejs";

const DEPRECATION_HEADERS = {
  "X-API-Deprecation":
    "GET /api/bookings is retired. Use GET /api/customer/bookings for customer dashboards or /api/admin/bookings for admin.",
};

/**
 * Legacy intake previously lived here. Customer and admin dashboards use dedicated Supabase-backed routes.
 */
export async function GET() {
  return Response.json(
    {
      success: true,
      bookings: [],
      deprecated: true,
      error:
        "GET /api/bookings is retired. Use GET /api/customer/bookings or GET /api/admin/bookings.",
      migration: {
        customerBookings: "/api/customer/bookings",
        adminBookings: "/api/admin/bookings",
      },
    },
    { status: 410, headers: DEPRECATION_HEADERS },
  );
}

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
