import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  nextApprovalStage,
  requiredApprovalStages,
  type ExpenseApprovalStage,
  type ExpenseApprovalStageAction,
} from "@/lib/admin/expenses/approvalWorkflow";
import { canApproveAtStage } from "@/lib/admin/expenses/approvalWorkflow";
import { isAdmin } from "@/lib/auth/admin";
import {
  loadExpenseNotifyContext,
  notifyExpenseApproved,
  notifyExpenseNeedsApproval,
  notifyExpenseRejected,
} from "@/lib/admin/expenses/sendFinanceApprovalEmails";

export type FinanceUserRoles = {
  financeAccess: boolean;
  financeManagerAccess: boolean;
  financeOwnerAccess: boolean;
};

export async function loadFinanceUserRoles(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<FinanceUserRoles> {
  const { data: profile } = await admin
    .from("user_profiles")
    .select("finance_access, finance_manager_access, finance_owner_access")
    .eq("id", userId)
    .maybeSingle();

  const adminUser = isAdmin(email);
  return {
    financeAccess: adminUser || profile?.finance_access === true,
    financeManagerAccess: adminUser || profile?.finance_manager_access === true,
    financeOwnerAccess: adminUser || profile?.finance_owner_access === true,
  };
}

export type ExpenseApprovalResult =
  | { ok: true; status: "approved" | "pending"; approval_stage: ExpenseApprovalStage }
  | { ok: false; error: string; status: number };

export async function approveExpenseWorkflow(
  admin: SupabaseClient,
  expenseId: string,
  actorId: string,
  email: string,
  comment?: string | null,
): Promise<ExpenseApprovalResult> {
  const { data: expense, error } = await admin
    .from("expenses")
    .select("id, amount_cents, status, approval_stage")
    .eq("id", expenseId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!expense) return { ok: false, error: "Not found.", status: 404 };
  if (expense.status === "approved") return { ok: false, error: "Already approved.", status: 400 };
  if (expense.status === "rejected") return { ok: false, error: "Expense was rejected.", status: 400 };

  const roles = await loadFinanceUserRoles(admin, actorId, email);
  const currentStage = (expense.approval_stage ?? "finance") as ExpenseApprovalStage;
  const actingStage: ExpenseApprovalStageAction =
    currentStage === "complete" || currentStage === "rejected"
      ? requiredApprovalStages(expense.amount_cents)[0]
      : (currentStage as ExpenseApprovalStageAction);

  if (
    !canApproveAtStage(actingStage, {
      isAdmin: isAdmin(email),
      ...roles,
    })
  ) {
    return { ok: false, error: `Not authorized to approve at ${actingStage} stage.`, status: 403 };
  }

  const now = new Date().toISOString();
  await admin.from("expense_approval_events").insert({
    expense_id: expenseId,
    stage: actingStage,
    action: "approved",
    actor_id: actorId,
    comment: comment?.trim() || null,
  });

  const upcoming = nextApprovalStage(expense.amount_cents, actingStage);
  if (upcoming) {
    const { error: updErr } = await admin
      .from("expenses")
      .update({
        approval_stage: upcoming,
        status: "pending",
        updated_at: now,
      })
      .eq("id", expenseId);
    if (updErr) return { ok: false, error: updErr.message, status: 500 };
    void loadExpenseNotifyContext(admin, expenseId).then((ctx) => {
      if (ctx) void notifyExpenseNeedsApproval(admin, ctx, upcoming);
    });
    return { ok: true, status: "pending", approval_stage: upcoming };
  }

  const { error: finalErr } = await admin
    .from("expenses")
    .update({
      status: "approved",
      approval_stage: "complete",
      approved_by: actorId,
      approved_at: now,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", expenseId);
  if (finalErr) return { ok: false, error: finalErr.message, status: 500 };
  void loadExpenseNotifyContext(admin, expenseId).then((ctx) => {
    if (ctx) void notifyExpenseApproved(admin, ctx, email);
  });
  const { enqueueAccountingSync } = await import("@/lib/accounting/accountingSyncQueue");
  void enqueueAccountingSync(admin, { entityType: "expense", entityId: expenseId });
  return { ok: true, status: "approved", approval_stage: "complete" };
}

export async function rejectExpenseWorkflow(
  admin: SupabaseClient,
  expenseId: string,
  actorId: string,
  email: string,
  rejectionReason: string,
  comment?: string | null,
): Promise<ExpenseApprovalResult> {
  const reason = rejectionReason.trim();
  if (!reason) return { ok: false, error: "Rejection reason is required.", status: 400 };

  const { data: expense, error } = await admin
    .from("expenses")
    .select("id, amount_cents, status, approval_stage")
    .eq("id", expenseId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!expense) return { ok: false, error: "Not found.", status: 404 };
  if (expense.status === "approved") return { ok: false, error: "Cannot reject approved expense.", status: 400 };

  const roles = await loadFinanceUserRoles(admin, actorId, email);
  const currentStage = (expense.approval_stage ?? "finance") as ExpenseApprovalStage;
  const actingStage: ExpenseApprovalStageAction =
    currentStage === "complete" || currentStage === "rejected"
      ? requiredApprovalStages(expense.amount_cents)[0]
      : (currentStage as ExpenseApprovalStageAction);

  if (
    !canApproveAtStage(actingStage, {
      isAdmin: isAdmin(email),
      ...roles,
    })
  ) {
    return { ok: false, error: `Not authorized to reject at ${actingStage} stage.`, status: 403 };
  }

  const now = new Date().toISOString();
  await admin.from("expense_approval_events").insert({
    expense_id: expenseId,
    stage: actingStage,
    action: "rejected",
    actor_id: actorId,
    comment: comment?.trim() || reason,
  });

  const { error: updErr } = await admin
    .from("expenses")
    .update({
      status: "rejected",
      approval_stage: "rejected",
      rejection_reason: reason,
      updated_at: now,
    })
    .eq("id", expenseId);

  if (updErr) return { ok: false, error: updErr.message, status: 500 };
  void loadExpenseNotifyContext(admin, expenseId).then((ctx) => {
    if (ctx) void notifyExpenseRejected(admin, ctx, reason, email);
  });
  return { ok: true, status: "pending", approval_stage: "rejected" };
}

export async function loadExpenseApprovalHistory(admin: SupabaseClient, expenseId: string) {
  const { data, error } = await admin
    .from("expense_approval_events")
    .select("id, stage, action, comment, created_at, actor_id")
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
