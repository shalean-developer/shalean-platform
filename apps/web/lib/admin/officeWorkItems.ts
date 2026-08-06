import type { AdminPermission } from "@/lib/admin/requirePermission";

export type OfficeWorkItemType = "booking.assignment" | "system.cron";
export type OfficeWorkItemPriority = "critical" | "high" | "medium" | "low";
export type OfficeWorkItemStatus = "open" | "overdue" | "blocked";
export type OfficeWorkItemCategory = "operational" | "system_health";
export type OfficeWorkItemGroup = "operational" | "system_health";

export type OfficeWorkItem = {
  id: string;
  type: OfficeWorkItemType;
  title: string;
  /** Human-readable primary description — never raw JSON. */
  summary: string;
  priority: OfficeWorkItemPriority;
  /** Same scale as priority; kept explicit for UI severity badges. */
  severity: OfficeWorkItemPriority;
  status: OfficeWorkItemStatus;
  category: OfficeWorkItemCategory;
  /** Short statement of why this matters to the business. */
  businessImpact: string;
  href: string;
  actionLabel: string;
  requiredPermission: AdminPermission;
  occurredAt: string | null;
  dueAt: string | null;
  lastSuccessAt: string | null;
  affectedRecordCount: number | null;
  /** Optional raw/diagnostic payload for an expandable technical-details area. */
  technicalDetails: string | null;
  branchId: string | null;
  teamId: string | null;
};

type WorkItemPolicy = {
  permission: AdminPermission;
  hrefPrefix: string;
  group: OfficeWorkItemGroup;
};

export const OFFICE_WORK_ITEM_POLICIES: Record<OfficeWorkItemType, WorkItemPolicy> = {
  "booking.assignment": { permission: "booking.assign", hrefPrefix: "/office/bookings", group: "operational" },
  "system.cron": { permission: "ops.health.view", hrefPrefix: "/office/ops-health", group: "system_health" },
};

/** Human-readable titles for known scheduled jobs. */
export const OFFICE_CRON_JOB_LABELS: Record<string, string> = {
  "generate-recurring-bookings": "Recurring booking generation",
  "charge-recurring-bookings": "Recurring booking charges",
  "charge-monthly-invoices": "Monthly invoice scheduler",
  "payout-integrity-daily": "Payout integrity check",
  "finance-daily-automation": "Finance daily automation",
  "ops-health-metrics": "Operations health metrics",
  "payment-recovery": "Payment recovery notifications",
  "booking-reminders": "Booking reminder notifications",
  "expire-pending-payments": "Pending payment expiry",
  "reconcile-paystack-transfers": "Paystack transfer reconciliation",
  "prune-system-logs": "System log pruning",
  "extend-cleaner-availability": "Cleaner availability extension",
  "referral-campaigns": "Referral campaign processing",
  "referral-credit-expiry": "Referral credit expiry",
};

export function isKnownOfficeWorkItemType(value: string): value is OfficeWorkItemType {
  return Object.prototype.hasOwnProperty.call(OFFICE_WORK_ITEM_POLICIES, value);
}

export function officeWorkItemGroup(item: Pick<OfficeWorkItem, "type" | "category">): OfficeWorkItemGroup {
  if (item.category === "operational" || item.category === "system_health") return item.category;
  return OFFICE_WORK_ITEM_POLICIES[item.type]?.group ?? "operational";
}

export function groupOfficeWorkItems(items: readonly OfficeWorkItem[]): {
  operational: OfficeWorkItem[];
  systemHealth: OfficeWorkItem[];
} {
  const operational: OfficeWorkItem[] = [];
  const systemHealth: OfficeWorkItem[] = [];
  for (const item of items) {
    if (officeWorkItemGroup(item) === "system_health") systemHealth.push(item);
    else operational.push(item);
  }
  return { operational, systemHealth };
}

export function humanizeCronJobName(jobName: string): string {
  const known = OFFICE_CRON_JOB_LABELS[jobName];
  if (known) return known;
  return jobName
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function looksLikeRawJson(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

/** Prefer a human summary; park raw JSON / stack dumps in technicalDetails. */
export function splitWorkItemDescription(raw: string | null | undefined, fallback: string): {
  summary: string;
  technicalDetails: string | null;
} {
  if (!raw || !raw.trim()) return { summary: fallback, technicalDetails: null };
  const trimmed = raw.trim();
  if (looksLikeRawJson(trimmed)) {
    return { summary: fallback, technicalDetails: trimmed };
  }
  return { summary: trimmed, technicalDetails: null };
}

export function canReceiveOfficeWorkItem(
  item: Pick<OfficeWorkItem, "type" | "requiredPermission" | "href">,
  permissions: ReadonlySet<string>,
): boolean {
  const policy = OFFICE_WORK_ITEM_POLICIES[item.type];
  return Boolean(
    policy &&
      policy.permission === item.requiredPermission &&
      item.href.startsWith(policy.hrefPrefix) &&
      permissions.has(policy.permission),
  );
}

export function sortOfficeWorkItems(items: OfficeWorkItem[]): OfficeWorkItem[] {
  const weight: Record<OfficeWorkItemPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...items].sort((a, b) => {
    const priority = weight[a.priority] - weight[b.priority];
    if (priority !== 0) return priority;
    const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });
}
