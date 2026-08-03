import type { EffectiveAdminScope } from "./effectiveAdminScope";

export const NO_BRANCH_ACCESS_UUID = "00000000-0000-0000-0000-000000000000";

type BranchScopedQuery<T> = {
  in(column: string, values: string[]): T;
  eq(column: string, value: string): T;
};

/**
 * Applies the effective admin branch scope to a Supabase query.
 *
 * Shalean currently stores an operational branch as `city_id` on bookings and
 * cleaners, and as `branch_id` on finance tables. Owners resolve to `*` and are
 * intentionally left unfiltered. A non-owner without an active branch assignment
 * receives an impossible UUID filter so the query fails closed with zero rows.
 */
export function applyEffectiveBranchScope<T>(params: {
  query: BranchScopedQuery<T>;
  scope: EffectiveAdminScope;
  column?: string;
}): T | BranchScopedQuery<T> {
  const column = params.column ?? "city_id";
  if (params.scope.isOwner || params.scope.branches.includes("*")) return params.query;

  const branchIds = [...new Set(params.scope.branches.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (branchIds.length === 0) return params.query.eq(column, NO_BRANCH_ACCESS_UUID);
  return params.query.in(column, branchIds);
}
