import type { OfficeRoleKey } from "@/lib/admin/officeExperience";

export type OfficeRoleAssignment = { code?: string };

const ROLE_CODE_MAP: Record<string, OfficeRoleKey> = {
  owner: "owner",
  general_manager: "manager",
  operations_admin: "operations",
  finance_admin: "finance",
  customer_care: "customer-care",
  workforce_admin: "workforce",
  marketing_admin: "marketing",
  supervisor: "supervisor",
};

const ROLE_PRIORITY: readonly OfficeRoleKey[] = [
  "owner",
  "manager",
  "operations",
  "finance",
  "customer-care",
  "workforce",
  "marketing",
  "supervisor",
];

export function officeRolesFromAssignments(assignments: readonly OfficeRoleAssignment[]): OfficeRoleKey[] {
  const roles = new Set<OfficeRoleKey>();
  for (const assignment of assignments) {
    const role = ROLE_CODE_MAP[String(assignment.code ?? "")];
    if (role) roles.add(role);
  }
  return ROLE_PRIORITY.filter((role) => roles.has(role));
}

export function primaryOfficeRole(assignments: readonly OfficeRoleAssignment[]): OfficeRoleKey {
  return officeRolesFromAssignments(assignments)[0] ?? "restricted";
}

export function audienceAllowsAnyAssignedRole(
  audience: readonly OfficeRoleKey[],
  roles: readonly OfficeRoleKey[],
): boolean {
  return roles.some((role) => audience.includes(role));
}

export function hasOnlyOfficeRole(roles: readonly OfficeRoleKey[], role: OfficeRoleKey): boolean {
  return roles.length === 1 && roles[0] === role;
}
