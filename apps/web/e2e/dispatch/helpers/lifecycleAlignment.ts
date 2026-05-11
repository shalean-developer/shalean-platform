import { expect } from "@playwright/test";

/** Subset of {@link import("@/lib/booking/bookingLifecycleContract").DashboardLifecycleAlignmentWire} on API payloads. */
export type DashboardAlignmentWire = {
  operationalPhase?: string;
  assignmentSemanticPhase?: string;
  hasEffectiveAssignee?: boolean;
};

export function alignmentFromCustomerBooking(row: Record<string, unknown>): DashboardAlignmentWire | null {
  const cl = row.canonicalLifecycle as Record<string, unknown> | undefined;
  if (!cl || typeof cl !== "object") return null;
  const da = cl.dashboardAlignment as Record<string, unknown> | undefined;
  if (!da || typeof da !== "object") return null;
  return {
    operationalPhase: typeof da.operationalPhase === "string" ? da.operationalPhase : undefined,
    assignmentSemanticPhase:
      typeof da.assignmentSemanticPhase === "string" ? da.assignmentSemanticPhase : undefined,
    hasEffectiveAssignee: typeof da.hasEffectiveAssignee === "boolean" ? da.hasEffectiveAssignee : undefined,
  };
}

export function alignmentFromCleanerJob(row: Record<string, unknown>): DashboardAlignmentWire | null {
  const dl = row.dashboardLifecycle as Record<string, unknown> | undefined;
  if (!dl || typeof dl !== "object") return null;
  return {
    operationalPhase: typeof dl.operationalPhase === "string" ? dl.operationalPhase : undefined,
    assignmentSemanticPhase:
      typeof dl.assignmentSemanticPhase === "string" ? dl.assignmentSemanticPhase : undefined,
    hasEffectiveAssignee: typeof dl.hasEffectiveAssignee === "boolean" ? dl.hasEffectiveAssignee : undefined,
  };
}

export function alignmentFromAdmin(dashboardLifecycle: unknown): DashboardAlignmentWire | null {
  if (!dashboardLifecycle || typeof dashboardLifecycle !== "object") return null;
  const dl = dashboardLifecycle as Record<string, unknown>;
  return {
    operationalPhase: typeof dl.operationalPhase === "string" ? dl.operationalPhase : undefined,
    assignmentSemanticPhase:
      typeof dl.assignmentSemanticPhase === "string" ? dl.assignmentSemanticPhase : undefined,
    hasEffectiveAssignee: typeof dl.hasEffectiveAssignee === "boolean" ? dl.hasEffectiveAssignee : undefined,
  };
}

/** Customer + admin payloads always include lifecycle Alignment in Gap 4 harness. */
export function expectCustomerAdminLifecycleAligned(
  customer: DashboardAlignmentWire | null,
  admin: DashboardAlignmentWire | null,
): void {
  expect(admin, "admin dashboardLifecycle missing").toBeTruthy();
  expect(customer, "customer canonicalLifecycle.dashboardAlignment missing").toBeTruthy();
  const adminPhase = admin!.operationalPhase;
  expect(adminPhase, "admin operationalPhase").toBeTruthy();
  expect(customer!.operationalPhase, "customer operationalPhase aligns with admin").toBe(adminPhase);
}

/** Assert shared lifecycle bundle matches across customer / cleaner / admin surfaces (Gap 4). */
export function expectLifecycleAlignedTriplet(args: {
  customer: DashboardAlignmentWire | null;
  cleaner: DashboardAlignmentWire | null;
  admin: DashboardAlignmentWire | null;
}): void {
  const { customer, cleaner, admin } = args;
  expectCustomerAdminLifecycleAligned(customer, admin);
  expect(cleaner, "cleaner dashboardLifecycle missing").toBeTruthy();
  expect(cleaner!.operationalPhase, "cleaner operationalPhase aligns with admin").toBe(admin!.operationalPhase);
}
