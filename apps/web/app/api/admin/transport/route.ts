import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { summarizeTransport } from "@/lib/admin/transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canManage(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string, write: boolean) {
  const permissions = write ? ["booking.assign", "expense.manage"] : ["booking.assign", "booking.view", "expense.manage", "finance.full.view"];
  for (const permission of permissions) {
    const { data } = await admin.rpc("admin_has_permission", { p_user_id: userId, p_permission: permission, p_branch_id: null, p_team_id: null });
    if (data === true) return true;
  }
  return false;
}

const value = (input: unknown) => String(input ?? "").trim();
const nullable = (input: unknown) => value(input) || null;

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await canManage(admin, auth.userId, false))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const [vehicles, drivers, runs] = await Promise.all([
    admin.from("fleet_vehicles").select("*").order("registration"),
    admin.from("transport_drivers").select("*").eq("is_active", true).order("full_name"),
    admin.from("transport_runs").select("*, fleet_vehicles(registration,make,model), transport_drivers(full_name,phone), transport_stops(*), transport_cost_entries(*)").order("scheduled_at", { ascending: false }).limit(100),
  ]);
  const error = vehicles.error ?? drivers.error ?? runs.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const vehicleRows = vehicles.data ?? [];
  const due = vehicleRows.filter((vehicle) => vehicle.service_due_km != null && Number(vehicle.odometer_km) >= Number(vehicle.service_due_km)).length;
  return NextResponse.json({ vehicles: vehicleRows, drivers: drivers.data ?? [], runs: runs.data ?? [], summary: summarizeTransport(runs.data ?? [], due) });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  if (!(await canManage(admin, auth.userId, true))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const action = value(body.action);
  let result: { data: unknown; error: { message: string; code?: string } | null };

  if (action === "vehicle") {
    const registration = value(body.registration).toUpperCase();
    const make = value(body.make); const model = value(body.model);
    if (!registration || !make || !model) return NextResponse.json({ error: "Registration, make and model are required." }, { status: 400 });
    result = await admin.from("fleet_vehicles").insert({ registration, make, model, year: body.year ? Number(body.year) : null, seats: Number(body.seats ?? 4), odometer_km: Number(body.odometer_km ?? 0), service_due_km: body.service_due_km ? Number(body.service_due_km) : null }).select("id").single();
  } else if (action === "driver") {
    const fullName = value(body.full_name); const phone = value(body.phone);
    if (!fullName || !phone) return NextResponse.json({ error: "Driver name and phone are required." }, { status: 400 });
    result = await admin.from("transport_drivers").insert({ full_name: fullName, phone, cleaner_id: nullable(body.cleaner_id), licence_number: nullable(body.licence_number), licence_expires_at: nullable(body.licence_expires_at) }).select("id").single();
  } else if (action === "run") {
    const vehicleId = nullable(body.vehicle_id); const driverId = nullable(body.driver_id); const scheduledAt = nullable(body.scheduled_at); const origin = value(body.origin); const destination = value(body.destination);
    if (!vehicleId || !driverId || !scheduledAt || !origin || !destination) return NextResponse.json({ error: "Vehicle, driver, schedule, origin and destination are required." }, { status: 400 });
    result = await admin.from("transport_runs").insert({ vehicle_id: vehicleId, driver_id: driverId, scheduled_at: scheduledAt, origin, destination, notes: nullable(body.notes), created_by: auth.userId }).select("id").single();
  } else if (action === "stop") {
    const runId = nullable(body.run_id); const stopType = value(body.stop_type); const address = value(body.address); const order = Number(body.stop_order);
    if (!runId || !["pickup","dropoff","booking","fuel","other"].includes(stopType) || !address || !Number.isInteger(order) || order <= 0) return NextResponse.json({ error: "Valid run, stop type, order and address are required." }, { status: 400 });
    result = await admin.from("transport_stops").insert({ run_id: runId, booking_id: nullable(body.booking_id), stop_order: order, stop_type: stopType, address, planned_at: nullable(body.planned_at), notes: nullable(body.notes) }).select("id").single();
  } else if (action === "cost") {
    const runId = nullable(body.run_id); const costType = value(body.cost_type); const amountCents = Number(body.amount_cents);
    if (!runId || !["fuel","parking","maintenance","toll","other"].includes(costType) || !Number.isInteger(amountCents) || amountCents <= 0) return NextResponse.json({ error: "Valid run, cost type and amount are required." }, { status: 400 });
    result = await admin.from("transport_cost_entries").insert({ run_id: runId, booking_id: nullable(body.booking_id), expense_id: nullable(body.expense_id), cost_type: costType, amount_cents: amountCents, occurred_at: nullable(body.occurred_at) ?? new Date().toISOString(), notes: nullable(body.notes), created_by: auth.userId }).select("id").single();
  } else if (action === "complete") {
    const runId = nullable(body.run_id); const endKm = Number(body.odometer_end_km);
    if (!runId || !Number.isFinite(endKm) || endKm < 0) return NextResponse.json({ error: "Run and ending odometer are required." }, { status: 400 });
    result = await admin.rpc("complete_transport_run", { p_run_id: runId, p_odometer_end_km: endKm, p_actor: auth.userId });
  } else return NextResponse.json({ error: "Unknown transport action." }, { status: 400 });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: result.error.code === "23505" ? 409 : 400 });
  return NextResponse.json({ ok: true, id: result.data }, { status: 201 });
}

