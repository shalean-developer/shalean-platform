import {
  triggerWhatsAppNotification,
  type CreatedBookingRecord,
} from "@/lib/booking/triggerWhatsAppNotification";
import { pickAvailableCleaner } from "@/lib/booking/pickAvailableCleaner";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Client-facing booking (camelCase only; no raw Supabase keys). */
type PublicBooking = {
  id: string;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  createdAt: string;
  cleanerId: string | null;
  dispatchStatus: string | null;
};

type DbBookingRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  location: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  created_at: string;
  cleaner_id?: string | null;
  dispatch_status?: string | null;
};

function mapDbBookingToPublic(row: DbBookingRow): PublicBooking {
  return {
    id: row.id,
    customerName: row.customer_name,
    phone: row.customer_phone,
    address: row.location,
    service: row.service,
    date: row.date,
    time: row.time,
    status: row.status,
    createdAt: row.created_at,
    cleanerId: row.cleaner_id ?? null,
    dispatchStatus: row.dispatch_status ?? null,
  };
}

function isDbBookingRow(row: unknown): row is DbBookingRow {
  if (row === null || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.created_at !== "string") return false;
  for (const key of ["customer_name", "customer_phone", "location", "service", "date", "time", "status"] as const) {
    const v = r[key];
    if (v !== null && typeof v !== "string") return false;
  }
  const cid = r.cleaner_id;
  if (cid !== null && cid !== undefined && typeof cid !== "string") return false;
  const ds = r.dispatch_status;
  if (ds !== null && ds !== undefined && typeof ds !== "string") return false;
  return true;
}

const BOOKING_SELECT =
  "id, customer_name, customer_phone, location, service, date, time, status, created_at, cleaner_id, dispatch_status";

async function fetchBookingRow(admin: SupabaseClient, bookingId: string): Promise<DbBookingRow | null> {
  const { data, error } = await admin.from("bookings").select(BOOKING_SELECT).eq("id", bookingId).maybeSingle();
  if (error || !data || !isDbBookingRow(data)) {
    if (error) console.error("[api/bookings] refetch booking failed", error.message);
    return null;
  }
  return data;
}

/** Marks booking for retry / admin when no cleaner or assignment could not complete. */
async function markBookingPendingAssignment(admin: SupabaseClient, bookingId: string): Promise<void> {
  try {
    const { error } = await admin
      .from("bookings")
      .update({ status: "pending_assignment", dispatch_status: "unassigned" })
      .eq("id", bookingId)
      .is("cleaner_id", null);
    if (error) {
      console.error("[api/bookings] mark pending_assignment failed", error.message);
    }
  } catch (err) {
    console.error("[api/bookings] mark pending_assignment threw", {
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

type BookingIntakeBody = {
  customerName: unknown;
  phone: unknown;
  address: unknown;
  service: unknown;
  date: unknown;
  time: unknown;
};

function hasRequiredBookingFields(body: unknown): body is BookingIntakeBody & Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  const o = body as Record<string, unknown>;
  const keys = ["customerName", "phone", "address", "service", "date", "time"] as const;
  return keys.every((k) => {
    const v = o[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

export async function POST(req: Request) {
  try {
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return Response.json(
        { success: false, error: "Invalid or missing JSON body" },
        { status: 400 },
      );
    }

    if (!hasRequiredBookingFields(body)) {
      return Response.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const intake = body as Record<string, string>;
    const customerName = intake.customerName.trim();
    const phone = intake.phone.trim();
    const address = intake.address.trim();
    const service = intake.service.trim();
    const date = intake.date.trim();
    const time = intake.time.trim();

    const admin = getSupabaseAdmin();
    if (!admin) {
      return Response.json({ success: false, error: "Failed to create booking" }, { status: 503 });
    }

    const paystack_reference = `API-${crypto.randomUUID()}`;

    const { data, error } = await admin
      .from("bookings")
      .insert({
        paystack_reference,
        customer_email: null,
        customer_name: customerName,
        customer_phone: phone,
        user_id: null,
        amount_paid_cents: 0,
        currency: "ZAR",
        booking_snapshot: null,
        status: "pending",
        service,
        location: address,
        date,
        time,
      })
      .select(BOOKING_SELECT)
      .single();

    if (error || !isDbBookingRow(data)) {
      console.error("[api/bookings] insert failed", error);
      return Response.json({ success: false, error: "Failed to create booking" }, { status: 500 });
    }

    let bookingRow: DbBookingRow = data;
    const cleaner = await pickAvailableCleaner(admin, date, time);

    if (!cleaner) {
      await markBookingPendingAssignment(admin, data.id);
      const r = await fetchBookingRow(admin, data.id);
      if (r) bookingRow = r;
    } else {
      const nowIso = new Date().toISOString();
      const { data: assigned, error: assignErr } = await admin
        .from("bookings")
        .update({
          cleaner_id: cleaner.id,
          status: "assigned",
          dispatch_status: "assigned",
          assigned_at: nowIso,
          last_declined_by_cleaner_id: null,
          last_declined_at: null,
        })
        .eq("id", data.id)
        .is("cleaner_id", null)
        .select(BOOKING_SELECT)
        .maybeSingle();

      if (assignErr) {
        console.error("[api/bookings] cleaner assignment update failed", assignErr.message, {
          code: assignErr.code,
          bookingId: data.id,
        });
      }

      if (assigned && isDbBookingRow(assigned)) {
        bookingRow = assigned;
        void triggerWhatsAppNotification(assigned as CreatedBookingRecord, {
          recipientPhone: cleaner.phone,
          cleanerDisplayName: cleaner.fullName,
          variant: "cleaner_job_assigned",
        });
      } else {
        const reread = await fetchBookingRow(admin, data.id);
        if (reread && isDbBookingRow(reread) && reread.cleaner_id) {
          bookingRow = reread;
          if (reread.cleaner_id === cleaner.id) {
            void triggerWhatsAppNotification(reread as CreatedBookingRecord, {
              recipientPhone: cleaner.phone,
              cleanerDisplayName: cleaner.fullName,
              variant: "cleaner_job_assigned",
            });
          }
        } else {
          await markBookingPendingAssignment(admin, data.id);
          const r2 = await fetchBookingRow(admin, data.id);
          if (r2 && isDbBookingRow(r2)) bookingRow = r2;
        }
      }
    }

    const booking: PublicBooking = mapDbBookingToPublic(bookingRow);

    return Response.json(
      {
        success: true,
        booking,
      },
      { status: 200 },
    );
  } catch {
    return Response.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
