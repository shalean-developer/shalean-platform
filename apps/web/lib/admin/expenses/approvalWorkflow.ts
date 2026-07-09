import "server-only";

/** Amount thresholds for multi-level expense approval (cents). */
export const EXPENSE_APPROVAL_THRESHOLDS = {
  /** Manager approval required at or above R5,000 */
  managerMinCents: 500_000,
  /** Owner approval required at or above R50,000 */
  ownerMinCents: 5_000_000,
} as const;

export type ExpenseApprovalStage = "finance" | "manager" | "owner" | "complete" | "rejected";

export type ExpenseApprovalStageAction = "finance" | "manager" | "owner";

/** Stages required for an expense amount before it can be fully approved. */
export function requiredApprovalStages(amountCents: number): ExpenseApprovalStageAction[] {
  const amount = Math.max(0, Math.round(amountCents));
  const stages: ExpenseApprovalStageAction[] = ["finance"];
  if (amount >= EXPENSE_APPROVAL_THRESHOLDS.managerMinCents) stages.push("manager");
  if (amount >= EXPENSE_APPROVAL_THRESHOLDS.ownerMinCents) stages.push("owner");
  return stages;
}

/** Next stage after current approval, or null if complete. */
export function nextApprovalStage(
  amountCents: number,
  currentStage: ExpenseApprovalStage,
): ExpenseApprovalStageAction | null {
  const required = requiredApprovalStages(amountCents);
  const idx = required.indexOf(currentStage as ExpenseApprovalStageAction);
  if (idx < 0) return required[0] ?? null;
  return required[idx + 1] ?? null;
}

/** Whether a user can act on the current approval stage. */
export function canApproveAtStage(
  stage: ExpenseApprovalStageAction,
  opts: {
    isAdmin: boolean;
    financeAccess: boolean;
    financeManagerAccess: boolean;
    financeOwnerAccess: boolean;
  },
): boolean {
  if (opts.isAdmin) return true;
  switch (stage) {
    case "finance":
      return opts.financeAccess;
    case "manager":
      return opts.financeManagerAccess || opts.financeAccess;
    case "owner":
      return opts.financeOwnerAccess;
    default:
      return false;
  }
}

export function stageLabel(stage: ExpenseApprovalStage | ExpenseApprovalStageAction): string {
  switch (stage) {
    case "finance":
      return "Finance Officer";
    case "manager":
      return "Manager";
    case "owner":
      return "Owner";
    case "complete":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return stage;
  }
}
