"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseSession } from "@/lib/supabase/browser";
import { hasAnyOfficePermission, policyForOfficePath } from "@/lib/admin/officeExperience";
import { OFFICE_NAV_ALL_ITEMS, OFFICE_NAV_MODULES, OFFICE_NAV_SECTIONS } from "./OfficeNav";
import { OfficeRoleDashboard } from "./OfficeRoleDashboard";

type PermissionResponse = {
  permissions?: string[];
};

const originalModules = OFFICE_NAV_MODULES.map((module) => ({
  ...module,
  children: module.children ? [...module.children] : undefined,
}));
const originalSections = OFFICE_NAV_SECTIONS.map((section) => ({ ...section, items: [...section.items] }));
const originalAllItems = [...OFFICE_NAV_ALL_ITEMS];

function isAllowed(href: string, permissions: ReadonlySet<string>): boolean {
  if (href === "/office") return permissions.size > 0;
  const policy = policyForOfficePath(href);
  return policy ? hasAnyOfficePermission(permissions, policy.anyOf) : false;
}

function applyNavigationPermissions(permissions: ReadonlySet<string>) {
  for (const module of OFFICE_NAV_MODULES) {
    const original = originalModules.find((candidate) => candidate.id === module.id);
    if (!original) continue;
    if (original.href) {
      module.href = isAllowed(original.href, permissions) ? original.href : undefined;
      module.children = undefined;
      continue;
    }
    module.children = (original.children ?? []).filter((item) => isAllowed(item.href, permissions));
  }

  OFFICE_NAV_MODULES.splice(
    0,
    OFFICE_NAV_MODULES.length,
    ...OFFICE_NAV_MODULES.filter((module) => Boolean(module.href) || (module.children?.length ?? 0) > 0),
  );

  for (const section of OFFICE_NAV_SECTIONS) {
    const original = originalSections.find((candidate) => candidate.title === section.title);
    section.items = (original?.items ?? []).filter((item) => isAllowed(item.href, permissions));
  }
  OFFICE_NAV_SECTIONS.splice(0, OFFICE_NAV_SECTIONS.length, ...OFFICE_NAV_SECTIONS.filter((section) => section.items.length > 0));

  OFFICE_NAV_ALL_ITEMS.splice(
    0,
    OFFICE_NAV_ALL_ITEMS.length,
    ...originalAllItems.filter((item) => isAllowed(item.href, permissions)),
  );
}

export function OfficePermissionNavigationGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [permissions, setPermissions] = useState<Set<string> | null>(null);

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
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) {
          if (active) setPermissions(new Set());
          return;
        }
        const payload = (await response.json()) as PermissionResponse;
        if (active) setPermissions(new Set(payload.permissions ?? []));
      } catch {
        if (active) setPermissions(new Set());
      }
    }

    void loadPermissions();
    return () => {
      active = false;
    };
  }, []);

  if (permissions === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading Office permissions…
      </div>
    );
  }

  applyNavigationPermissions(permissions);
  if (pathname === "/office") return <OfficeRoleDashboard permissions={permissions} />;
  return children;
}
