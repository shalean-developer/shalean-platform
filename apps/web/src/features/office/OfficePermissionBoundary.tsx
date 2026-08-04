"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseSession } from "@/lib/supabase/browser";
import {
  hasAnyOfficePermission,
  policyForOfficePath,
  type OfficeRoleKey,
} from "@/lib/admin/officeExperience";

type RoleAssignment = { code?: string };
type PermissionPayload = { permissions?: string[]; roles?: RoleAssignment[] };

type State =
  | { status: "checking" }
  | { status: "allowed" }
  | { status: "denied"; permissions: string[] }
  | { status: "error"; message: string };

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

const SUPERVISOR_TEAM_SCOPE_PENDING = [
  "/office/recurring",
  "/office/sla-breaches",
  "/office/ops-queue",
  "/office/operations",
  "/office/cleaners",
  "/office/cleaner-report-feedback",
  "/office/cleaner-performance",
] as const;

function roleFromAssignments(roles: RoleAssignment[]): OfficeRoleKey {
  for (const assignment of roles) {
    const code = String(assignment.code ?? "");
    const mapped = ROLE_CODE_MAP[code];
    if (mapped) return mapped;
  }
  return "restricted";
}

function supervisorScopePending(pathname: string, role: OfficeRoleKey): boolean {
  return role === "supervisor" && SUPERVISOR_TEAM_SCOPE_PENDING.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function OfficePermissionBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const policy = useMemo(() => policyForOfficePath(pathname), [pathname]);
  const [state, setState] = useState<State>({ status: "checking" });

  useEffect(() => {
    let active = true;
    if (!policy) {
      setState({ status: "allowed" });
      return () => { active = false; };
    }

    setState({ status: "checking" });
    void getSupabaseSession().then(async (session) => {
      if (!active) return;
      const token = session?.access_token;
      if (!token) {
        setState({ status: "error", message: "Your admin session could not be verified." });
        return;
      }

      try {
        const response = await fetch("/api/admin/security/my-permissions", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!active) return;
        if (!response.ok) {
          setState({ status: "error", message: "Permission verification is temporarily unavailable." });
          return;
        }
        const payload = (await response.json()) as PermissionPayload;
        const permissions = new Set(Array.isArray(payload.permissions) ? payload.permissions : []);
        const role = roleFromAssignments(Array.isArray(payload.roles) ? payload.roles : []);
        const allowed =
          policy.audience.includes(role) &&
          !supervisorScopePending(pathname, role) &&
          hasAnyOfficePermission(permissions, policy.anyOf);
        setState(
          allowed
            ? { status: "allowed" }
            : { status: "denied", permissions: policy.anyOf },
        );
      } catch {
        if (active) setState({ status: "error", message: "Permission verification is temporarily unavailable." });
      }
    });

    return () => { active = false; };
  }, [pathname, policy]);

  if (state.status === "allowed") return <>{children}</>;

  if (state.status === "checking") {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-label="Checking permissions" />;
  }

  return (
    <section className="mx-auto mt-10 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Access Restricted</h1>
      <p className="mt-3 text-sm text-slate-600">
        {state.status === "denied"
          ? "This page is not included in your assigned Office role. Contact the Owner if your responsibilities have changed."
          : state.message}
      </p>
      {state.status === "denied" ? (
        <p className="mt-2 font-mono text-xs text-slate-400">Requires any of: {state.permissions.join(", ")}</p>
      ) : null}
      <Link href="/office" className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
        Return to your dashboard
      </Link>
    </section>
  );
}
