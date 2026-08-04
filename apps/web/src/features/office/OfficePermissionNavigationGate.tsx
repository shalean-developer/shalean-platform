"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseSession } from "@/lib/supabase/browser";
import {
  hasAnyOfficePermission,
  policyForOfficePath,
  type OfficeRoleKey,
} from "@/lib/admin/officeExperience";
import { OFFICE_NAV_ALL_ITEMS, OFFICE_NAV_MODULES, OFFICE_NAV_SECTIONS } from "./OfficeNav";
import { OfficeMyWorkPanel } from "./OfficeMyWorkPanel";
import { OfficeRoleDashboard, type OfficeAccessProfile } from "./OfficeRoleDashboard";

type PermissionResponse = OfficeAccessProfile & { permissions?: string[] };

const originalModules = OFFICE_NAV_MODULES.map((module) => ({
  ...module,
  children: module.children ? [...module.children] : undefined,
}));
const originalSections = OFFICE_NAV_SECTIONS.map((section) => ({ ...section, items: [...section.items] }));
const originalAllItems = [...OFFICE_NAV_ALL_ITEMS];

// The Earnings Policies route existed before the RBAC navigation rewrite, but
// its Finance menu entry was accidentally omitted. Reuse the Pricing icon so
// the page is restored without duplicating icon imports or weakening access.
const financeModule = originalModules.find((module) => module.id === "finance");
const pricingItem = financeModule?.children?.find((item) => item.href === "/office/pricing");
if (financeModule?.children && pricingItem && !financeModule.children.some((item) => item.href === "/office/earnings-policies")) {
  const pricingIndex = financeModule.children.findIndex((item) => item.href === "/office/pricing");
  financeModule.children.splice(pricingIndex + 1, 0, {
    ...pricingItem,
    label: "Earnings Policies",
    href: "/office/earnings-policies",
  });

  const financeSection = originalSections.find((section) => section.title === "FINANCE");
  if (financeSection && !financeSection.items.some((item) => item.href === "/office/earnings-policies")) {
    const sectionPricingIndex = financeSection.items.findIndex((item) => item.href === "/office/pricing");
    financeSection.items.splice(sectionPricingIndex + 1, 0, {
      ...pricingItem,
      label: "Earnings Policies",
      href: "/office/earnings-policies",
    });
  }

  const allPricingIndex = originalAllItems.findIndex((item) => item.href === "/office/pricing");
  originalAllItems.splice(allPricingIndex + 1, 0, {
    ...pricingItem,
    label: "Earnings Policies",
    href: "/office/earnings-policies",
    section: "Finance",
  });
}

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

/** Company-wide read models that do not yet accept a team scope. */
const SUPERVISOR_TEAM_SCOPE_PENDING = [
  "/office/recurring",
  "/office/sla-breaches",
  "/office/ops-queue",
  "/office/operations",
  "/office/cleaners",
  "/office/cleaner-report-feedback",
  "/office/cleaner-performance",
] as const;

function roleFromProfile(profile: OfficeAccessProfile): OfficeRoleKey {
  for (const assignment of profile.roles) {
    const mapped = ROLE_CODE_MAP[assignment.code];
    if (mapped) return mapped;
  }
  return "restricted";
}

function isSupervisorScopePending(href: string, role: OfficeRoleKey): boolean {
  return role === "supervisor" && SUPERVISOR_TEAM_SCOPE_PENDING.some(
    (path) => href === path || href.startsWith(`${path}/`),
  );
}

function isAllowed(href: string, permissions: ReadonlySet<string>, role: OfficeRoleKey): boolean {
  if (href === "/office") return permissions.size > 0;
  if (isSupervisorScopePending(href, role)) return false;
  const policy = policyForOfficePath(href);
  return policy
    ? policy.audience.includes(role) && hasAnyOfficePermission(permissions, policy.anyOf)
    : false;
}

function applyNavigationPermissions(permissions: ReadonlySet<string>, role: OfficeRoleKey) {
  OFFICE_NAV_MODULES.splice(0, OFFICE_NAV_MODULES.length, ...originalModules.map((module) => ({
    ...module,
    children: module.children ? [...module.children] : undefined,
  })));
  OFFICE_NAV_SECTIONS.splice(0, OFFICE_NAV_SECTIONS.length, ...originalSections.map((section) => ({
    ...section,
    items: [...section.items],
  })));

  for (const module of OFFICE_NAV_MODULES) {
    const original = originalModules.find((candidate) => candidate.id === module.id);
    if (!original) continue;
    if (original.href) {
      module.href = isAllowed(original.href, permissions, role) ? original.href : undefined;
      module.children = undefined;
      continue;
    }
    module.children = (original.children ?? []).filter((item) => isAllowed(item.href, permissions, role));
  }
  OFFICE_NAV_MODULES.splice(
    0,
    OFFICE_NAV_MODULES.length,
    ...OFFICE_NAV_MODULES.filter((module) => Boolean(module.href) || (module.children?.length ?? 0) > 0),
  );

  for (const section of OFFICE_NAV_SECTIONS) {
    const original = originalSections.find((candidate) => candidate.title === section.title);
    section.items = (original?.items ?? []).filter((item) => isAllowed(item.href, permissions, role));
  }
  OFFICE_NAV_SECTIONS.splice(
    0,
    OFFICE_NAV_SECTIONS.length,
    ...OFFICE_NAV_SECTIONS.filter((section) => section.items.length > 0),
  );
  OFFICE_NAV_ALL_ITEMS.splice(
    0,
    OFFICE_NAV_ALL_ITEMS.length,
    ...originalAllItems.filter((item) => isAllowed(item.href, permissions, role)),
  );
}

function applyPageActionPermissions(pathname: string, permissions: ReadonlySet<string>) {
  if (pathname !== "/office/bookings") return;
  const canCreate = permissions.has("booking.create");
  const canExport = permissions.has("booking.export");

  for (const element of document.querySelectorAll<HTMLElement>('a[href="/office/bookings/create"], a[href="/admin/bookings/create"]')) {
    element.hidden = !canCreate;
    element.setAttribute("aria-hidden", String(!canCreate));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("button")) {
    const label = button.textContent?.trim().toLowerCase() ?? "";
    if (label === "export") {
      button.hidden = !canExport;
      button.setAttribute("aria-hidden", String(!canExport));
    }
  }
}

const EMPTY_PROFILE: OfficeAccessProfile = { roles: [], branchIds: [], teamIds: [] };

export function OfficePermissionNavigationGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [permissions, setPermissions] = useState<Set<string> | null>(null);
  const [profile, setProfile] = useState<OfficeAccessProfile>(EMPTY_PROFILE);

  useEffect(() => {
    let active = true;
    async function loadPermissions() {
      const session = await getSupabaseSession();
      const token = session?.access_token;
      if (!token) {
        if (active) setPermissions(new Set());
        return;
      }
      try {
        const response = await fetch("/api/admin/security/my-permissions", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        if (!response.ok) {
          if (active) setPermissions(new Set());
          return;
        }
        const payload = (await response.json()) as PermissionResponse;
        if (active) {
          setPermissions(new Set(payload.permissions ?? []));
          setProfile({ roles: payload.roles ?? [], branchIds: payload.branchIds ?? [], teamIds: payload.teamIds ?? [] });
        }
      } catch {
        if (active) setPermissions(new Set());
      }
    }
    void loadPermissions();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!permissions) return;
    const apply = () => applyPageActionPermissions(pathname, permissions);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, permissions]);

  if (permissions === null) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading Office permissions…</div>;
  }

  applyNavigationPermissions(permissions, roleFromProfile(profile));
  if (pathname === "/office") {
    return <div className="min-h-full bg-slate-50/60">
      <div className="mx-auto w-full max-w-[1600px] space-y-7 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
        <OfficeRoleDashboard permissions={permissions} profile={profile} />
        <OfficeMyWorkPanel />
        <footer className="flex flex-col gap-2 border-t border-slate-200 px-1 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Shalean Cleaning Services. All rights reserved.</span>
          <span>Staging Environment</span>
        </footer>
      </div>
    </div>;
  }
  return children;
}
