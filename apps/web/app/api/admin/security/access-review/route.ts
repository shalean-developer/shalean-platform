import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAnyAdminPermissionFromRequest } from "@/lib/admin/requirePermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssignmentRow = {
  id: string;
  user_id: string;
  role_id: string;
  branch_id: string | null;
  team_id: string | null;
  starts_at: string;
  expires_at: string | null;
  granted_by: string | null;
  reason: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type RoleRow = { id: string; code: string; name: string; is_active: boolean };
type ReviewRow = {
  id: string;
  assignment_id: string;
  reviewer_user_id: string;
  outcome: "keep" | "change_required" | "revoke_required";
  notes: string | null;
  reviewed_at: string;
  next_review_at: string;
};

function configuredAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
}

function statusOf(row: AssignmentRow, now: number): "active" | "scheduled" | "expired" | "revoked" {
  if (row.revoked_at) return "revoked";
  if (Date.parse(row.starts_at) > now) return "scheduled";
  if (row.expires_at && Date.parse(row.expires_at) <= now) return "expired";
  return "active";
}

async function loadUsers(admin: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const users = new Map<string, string>();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const user of data.users) users.set(user.id, user.email ?? user.id);
    if (data.users.length < 1000) break;
    page += 1;
    if (page > 10) break;
  }
  return users;
}

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["audit.view", "role.manage"]);
  if (!auth.ok) return auth.response;
  const admin = configuredAdminClient();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [assignmentsRes, rolesRes, reviewsRes, users] = await Promise.all([
    admin.from("admin_user_roles").select("id,user_id,role_id,branch_id,team_id,starts_at,expires_at,granted_by,reason,revoked_at,created_at,updated_at").order("created_at", { ascending: false }).limit(1000),
    admin.from("admin_roles").select("id,code,name,is_active").limit(200),
    admin.from("admin_access_reviews").select("id,assignment_id,reviewer_user_id,outcome,notes,reviewed_at,next_review_at").order("reviewed_at", { ascending: false }).limit(5000),
    loadUsers(admin),
  ]);

  if (assignmentsRes.error || rolesRes.error || reviewsRes.error) {
    console.error("Admin access review load failed", {
      assignments: assignmentsRes.error?.code,
      roles: rolesRes.error?.code,
      reviews: reviewsRes.error?.code,
    });
    return NextResponse.json({ error: "Unable to load access review." }, { status: 500 });
  }

  const now = Date.now();
  const roles = new Map(((rolesRes.data ?? []) as RoleRow[]).map((row) => [row.id, row]));
  const latestReview = new Map<string, ReviewRow>();
  for (const row of (reviewsRes.data ?? []) as ReviewRow[]) {
    if (!latestReview.has(row.assignment_id)) latestReview.set(row.assignment_id, row);
  }

  const assignments = ((assignmentsRes.data ?? []) as AssignmentRow[]).map((row) => {
    const role = roles.get(row.role_id);
    const review = latestReview.get(row.id) ?? null;
    const status = statusOf(row, now);
    const reviewDue = status === "active" && (!review || Date.parse(review.next_review_at) <= now);
    const expiresSoon = status === "active" && Boolean(row.expires_at) && Date.parse(row.expires_at as string) <= now + 7 * 24 * 60 * 60_000;
    return {
      assignmentId: row.id,
      userId: row.user_id,
      userEmail: users.get(row.user_id) ?? row.user_id,
      roleId: row.role_id,
      roleCode: role?.code ?? "unknown",
      roleName: role?.name ?? "Unknown role",
      roleActive: role?.is_active ?? false,
      branchId: row.branch_id,
      teamId: row.team_id,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      reason: row.reason,
      status,
      reviewDue,
      expiresSoon,
      latestReview: review ? {
        id: review.id,
        reviewerUserId: review.reviewer_user_id,
        reviewerEmail: users.get(review.reviewer_user_id) ?? review.reviewer_user_id,
        outcome: review.outcome,
        notes: review.notes,
        reviewedAt: review.reviewed_at,
        nextReviewAt: review.next_review_at,
      } : null,
    };
  });

  const counts = assignments.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] += 1;
      if (item.reviewDue) acc.reviewDue += 1;
      if (item.expiresSoon) acc.expiresSoon += 1;
      return acc;
    },
    { total: 0, active: 0, scheduled: 0, expired: 0, revoked: 0, reviewDue: 0, expiresSoon: 0 },
  );

  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), counts, assignments }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["audit.view", "role.manage"]);
  if (!auth.ok) return auth.response;
  const admin = configuredAdminClient();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = await request.json().catch(() => null) as { assignmentId?: string; outcome?: string; notes?: string } | null;
  const assignmentId = body?.assignmentId?.trim();
  const outcome = body?.outcome;
  const notes = body?.notes?.trim().slice(0, 1000) || null;
  if (!assignmentId || !["keep", "change_required", "revoke_required"].includes(outcome ?? "")) {
    return NextResponse.json({ error: "Valid assignmentId and outcome are required." }, { status: 400 });
  }

  const { data: assignment, error: assignmentError } = await admin
    .from("admin_user_roles")
    .select("id,user_id,role_id,branch_id,team_id,starts_at,expires_at,revoked_at")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError) return NextResponse.json({ error: "Unable to verify assignment." }, { status: 500 });
  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });

  const reviewedAt = new Date();
  const nextReviewAt = new Date(reviewedAt.getTime() + 30 * 24 * 60 * 60_000);
  const { data: review, error: reviewError } = await admin.from("admin_access_reviews").insert({
    assignment_id: assignmentId,
    reviewer_user_id: auth.user.id,
    outcome,
    notes,
    reviewed_at: reviewedAt.toISOString(),
    next_review_at: nextReviewAt.toISOString(),
  }).select("id,reviewed_at,next_review_at").single();
  if (reviewError) {
    console.error("Admin access review write failed", { assignmentId, code: reviewError.code });
    return NextResponse.json({ error: "Unable to record access review." }, { status: 500 });
  }

  const { error: auditError } = await admin.from("admin_audit_events").insert({
    actor_user_id: auth.user.id,
    event_type: "admin_access_review_recorded",
    target_type: "admin_user_roles",
    target_id: assignmentId,
    permission_code: auth.permission,
    reason: notes,
    old_value: null,
    new_value: { outcome, next_review_at: nextReviewAt.toISOString() },
    metadata: { review_id: review.id, assignment },
  });
  if (auditError) {
    console.error("Admin access review audit write failed", { assignmentId, code: auditError.code });
    await admin.from("admin_access_reviews").delete().eq("id", review.id);
    return NextResponse.json({ error: "Audit logging failed; review was not recorded." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, review });
}
