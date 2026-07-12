import { NextResponse } from "next/server";
import {
  applyCustomerProfilePatch,
  loadCustomerProfileDto,
  parseCustomerProfilePatchBody,
} from "@/lib/customer/customerProfileApi";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

export async function GET(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const loaded = await loadCustomerProfileDto(admin, auth.userId, auth.email, bearerToken(request));
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  return NextResponse.json({ profile: loaded.profile });
}

export async function PATCH(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Never accept identity fields from the client.
  delete body.id;
  delete body.email;
  delete body.role;
  delete body.userId;
  delete body.user_id;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const patch = parseCustomerProfilePatchBody(body);
  const applied = await applyCustomerProfilePatch(admin, auth.userId, bearerToken(request), patch);
  if (!applied.ok) {
    return NextResponse.json({ error: applied.error }, { status: applied.status });
  }

  const loaded = await loadCustomerProfileDto(admin, auth.userId, auth.email, bearerToken(request));
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  return NextResponse.json({ profile: loaded.profile });
}
