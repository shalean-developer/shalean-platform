import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { stageLabel, type ExpenseApprovalStageAction } from "@/lib/admin/expenses/approvalWorkflow";
import { createFinanceNotification } from "@/lib/admin/expenses/financeNotifications";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";

function financeEmailList(): string[] {
  return (process.env.FINANCE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function adminEmailList(): string[] {
  const fromList = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const single = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (single && !fromList.includes(single)) return [...fromList, single];
  return fromList;
}

type ApproverUser = { id: string; email: string };

async function loadApproversForStage(
  admin: SupabaseClient,
  stage: ExpenseApprovalStageAction,
): Promise<ApproverUser[]> {
  const column =
    stage === "finance"
      ? "finance_access"
      : stage === "manager"
        ? "finance_manager_access"
        : "finance_owner_access";

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, email")
    .eq(column, true);

  const users: ApproverUser[] = [];
  const seen = new Set<string>();

  for (const p of profiles ?? []) {
    const email = (p.email ?? "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    users.push({ id: p.id, email });
  }

  if (stage === "finance") {
    for (const email of [...financeEmailList(), ...adminEmailList()]) {
      if (seen.has(email)) continue;
      seen.add(email);
      users.push({ id: email, email });
    }
  }

  return users;
}

function formatZar(cents: number): string {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function expenseOfficeUrl(expenseId: string): string {
  return `${getPublicAppUrlBase()}/office/expenses?highlight=${expenseId}`;
}

async function sendApprovalEmail(opts: {
  to: string[];
  subject: string;
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
}): Promise<void> {
  if (opts.to.length === 0) return;
  const resend = getResend();
  if (!resend) return;

  const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2 style="margin: 0 0 8px;">Shalean<span style="color:#2563eb;">.</span> Finance</h2>
  <h3 style="margin: 0 0 12px; font-size: 18px;">${opts.title}</h3>
  <p style="line-height: 1.5; margin: 0 0 16px;">${opts.body}</p>
  <a href="${opts.actionUrl}" style="display: inline-block; background: #408df7; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 600;">${opts.actionLabel}</a>
  <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">Shalean Cleaning Services — finance notification</p>
</div>`;

  await resend.emails.send({
    from: getDefaultFromAddress(),
    to: opts.to,
    subject: opts.subject,
    html,
  });
}

export type ExpenseNotifyContext = {
  id: string;
  description: string;
  amount_cents: number;
  expense_date?: string;
  created_by?: string | null;
};

async function notifyUsers(
  admin: SupabaseClient,
  users: ApproverUser[],
  opts: {
    type: string;
    title: string;
    body: string;
    link: string;
    entityId: string;
    emailSubject: string;
    emailTitle: string;
    emailBody: string;
  },
): Promise<void> {
  const emails = users.map((u) => u.email).filter(Boolean);
  for (const user of users) {
    if (user.id.includes("@")) continue;
    try {
      await createFinanceNotification(admin, {
        userId: user.id,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        link: opts.link,
        entityType: "expense",
        entityId: opts.entityId,
      });
    } catch {
      /* non-blocking */
    }
  }
  try {
    await sendApprovalEmail({
      to: emails,
      subject: opts.emailSubject,
      title: opts.emailTitle,
      body: opts.emailBody,
      actionUrl: opts.link.startsWith("http") ? opts.link : `${getPublicAppUrlBase()}${opts.link}`,
      actionLabel: "Review expense",
    });
  } catch {
    /* non-blocking */
  }
}

export async function notifyExpenseSubmitted(admin: SupabaseClient, expense: ExpenseNotifyContext): Promise<void> {
  const approvers = await loadApproversForStage(admin, "finance");
  const link = `/office/expenses?status=pending`;
  const amount = formatZar(expense.amount_cents);
  await notifyUsers(admin, approvers, {
    type: "expense_submitted",
    title: "Expense pending approval",
    body: `${expense.description} — ${amount} awaiting Finance Officer review.`,
    link,
    entityId: expense.id,
    emailSubject: `Expense pending approval: ${expense.description}`,
    emailTitle: "New expense submitted",
    emailBody: `<strong>${expense.description}</strong> (${amount}) was submitted and needs Finance Officer approval.`,
  });
}

export async function notifyExpenseNeedsApproval(
  admin: SupabaseClient,
  expense: ExpenseNotifyContext,
  stage: ExpenseApprovalStageAction,
): Promise<void> {
  const approvers = await loadApproversForStage(admin, stage);
  const label = stageLabel(stage);
  const link = expenseOfficeUrl(expense.id);
  const amount = formatZar(expense.amount_cents);
  await notifyUsers(admin, approvers, {
    type: "expense_needs_approval",
    title: `${label} approval required`,
    body: `${expense.description} — ${amount} needs your approval.`,
    link,
    entityId: expense.id,
    emailSubject: `Expense needs ${label} approval: ${expense.description}`,
    emailTitle: `${label} approval required`,
    emailBody: `<strong>${expense.description}</strong> (${amount}) was approved at the prior stage and now requires <strong>${label}</strong> sign-off.`,
  });
}

export async function notifyExpenseApproved(
  admin: SupabaseClient,
  expense: ExpenseNotifyContext,
  actorEmail: string,
): Promise<void> {
  if (!expense.created_by) return;
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, email")
    .eq("id", expense.created_by)
    .maybeSingle();
  if (!profile?.email) return;

  const amount = formatZar(expense.amount_cents);
  const link = expenseOfficeUrl(expense.id);
  try {
    await createFinanceNotification(admin, {
      userId: profile.id,
      type: "expense_approved",
      title: "Expense approved",
      body: `${expense.description} (${amount}) was fully approved.`,
      link,
      entityType: "expense",
      entityId: expense.id,
    });
    await sendApprovalEmail({
      to: [profile.email],
      subject: `Expense approved: ${expense.description}`,
      title: "Expense approved",
      body: `Your expense <strong>${expense.description}</strong> (${amount}) was fully approved by ${actorEmail}.`,
      actionUrl: link,
      actionLabel: "View expense",
    });
  } catch {
    /* non-blocking */
  }
}

export async function notifyExpenseRejected(
  admin: SupabaseClient,
  expense: ExpenseNotifyContext,
  reason: string,
  actorEmail: string,
): Promise<void> {
  if (!expense.created_by) return;
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, email")
    .eq("id", expense.created_by)
    .maybeSingle();
  if (!profile?.email) return;

  const amount = formatZar(expense.amount_cents);
  const link = expenseOfficeUrl(expense.id);
  try {
    await createFinanceNotification(admin, {
      userId: profile.id,
      type: "expense_rejected",
      title: "Expense rejected",
      body: `${expense.description} (${amount}) was rejected: ${reason}`,
      link,
      entityType: "expense",
      entityId: expense.id,
    });
    await sendApprovalEmail({
      to: [profile.email],
      subject: `Expense rejected: ${expense.description}`,
      title: "Expense rejected",
      body: `Your expense <strong>${expense.description}</strong> (${amount}) was rejected by ${actorEmail}.<br/><br/>Reason: ${reason}`,
      actionUrl: link,
      actionLabel: "View expense",
    });
  } catch {
    /* non-blocking */
  }
}

export async function loadExpenseNotifyContext(
  admin: SupabaseClient,
  expenseId: string,
): Promise<ExpenseNotifyContext | null> {
  const { data } = await admin
    .from("expenses")
    .select("id, description, amount_cents, expense_date, created_by")
    .eq("id", expenseId)
    .maybeSingle();
  return data ?? null;
}
