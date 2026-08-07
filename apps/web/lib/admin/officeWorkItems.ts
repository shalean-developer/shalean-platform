import type { AdminPermission } from "@/lib/admin/requirePermission";

export type OfficeWorkItemType = "booking.assignment" | "system.cron" | "workforce.application";
export type OfficeWorkItemPriority = "critical" | "high" | "medium" | "low";
export type OfficeWorkItemStatus = "open" | "overdue" | "blocked";

export type OfficeWorkItem = {
  id: string;
  type: OfficeWorkItemType;
  title: string;
  summary: string;
  priority: OfficeWorkItemPriority;
  status: OfficeWorkItemStatus;
  href: string;
  actionLabel: string;
  requiredPermission: AdminPermission;
  occurredAt: string | null;
  dueAt: string | null;
  branchId: string | null;
  teamId: string | null;
};

type WorkItemPolicy = {
  permission: AdminPermission;
  hrefPrefix: string;
};

export const OFFICE_WORK_ITEM_POLICIES: Record<OfficeWorkItemType, WorkItemPolicy> = {
  "booking.assignment": { permission: "booking.assign", hrefPrefix: "/office/bookings" },
  "system.cron": { permission: "ops.health.view", hrefPrefix: "/office/ops-health" },
  "workforce.application": { permission: "application.decide", hrefPrefix: "/office/cleaner-applications" },
};

export function isKnownOfficeWorkItemType(value: string): value is OfficeWorkItemType {
  return Object.prototype.hasOwnProperty.call(OFFICE_WORK_ITEM_POLICIES, value);
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
