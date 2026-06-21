import { NextResponse } from "next/server";

import {
  assertAdminCustomerAccount,
  deleteAdminCustomerAccount,
  loadAdminCustomerDetail,
  updateAdminCustomerContact,
} from "@/lib/admin/adminCustomerDetail";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ userId: string }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const gate = await assertAdminCustomerAccount(admin, userId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const customer = await loadAdminCustomerDetail(admin, userId);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  return NextResponse.json({ customer });
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const gate = await assertAdminCustomerAccount(admin, userId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const result = await updateAdminCustomerContact(admin, userId, {
    full_name: typeof raw.full_name === "string" ? raw.full_name : undefined,
    phone: typeof raw.phone === "string" ? raw.phone : undefined,
    billing_email:
      raw.billing_email === null
        ? null
        : typeof raw.billing_email === "string"
          ? raw.billing_email
          : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const customer = await loadAdminCustomerDetail(admin, userId);
  return NextResponse.json({ ok: true, customer });
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await deleteAdminCustomerAccount(admin, userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
