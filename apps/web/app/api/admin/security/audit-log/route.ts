import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SENSITIVE_KEY = /(?:secret|token|password|authorization|cookie|bank(?:_|\s)?account|account(?:_|\s)?number|id(?:_|\s)?number|identity(?:_|\s)?number|access(?:_|\s)?key|api(?:_|\s)?key|private(?:_|\s)?key|oauth(?:_|\s)?code|payment(?:_|\s)?reference)/i;

function configuredAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeAuditValue(child, depth + 1);
  }
  return result;
}

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "audit.view");
  if (!auth.ok) return auth.response;

  const admin = configuredAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const url = new URL(request.url);
  const limit = positiveInt(url.searchParams.get("limit"), 100, 250);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const eventType = url.searchParams.get("eventType")?.trim() || null;
  const targetType = url.searchParams.get("targetType")?.trim() || null;
  const actorUserId = url.searchParams.get("actorUserId")?.trim() || null;
  const since = url.searchParams.get("since")?.trim() || null;

  let query = admin
    .from("admin_audit_events")
    .select(
      "id,actor_user_id,event_type,target_type,target_id,permission_code,reason,old_value,new_value,metadata,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventType) query = query.eq("event_type", eventType);
  if (targetType) query = query.eq("target_type", targetType);
  if (actorUserId) query = query.eq("actor_user_id", actorUserId);
  if (since) query = query.gte("created_at", since);

  const { data, error, count } = await query;
  if (error) {
    console.error("security audit-log query failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Unable to load audit records." }, { status: 500 });
  }

  const events = (data ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    targetType: row.target_type,
    targetId: row.target_id,
    permissionCode: row.permission_code,
    reason: row.reason,
    oldValue: sanitizeAuditValue(row.old_value),
    newValue: sanitizeAuditValue(row.new_value),
    metadata: sanitizeAuditValue(row.metadata),
    createdAt: row.created_at,
  }));

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      count: count ?? events.length,
      limit,
      offset,
      events,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
