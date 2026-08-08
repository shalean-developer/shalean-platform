"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseSession } from "@/lib/supabase/browser";

type ActiveMode = "supervisor" | "cleaner";
type PermissionResponse = { roles?: Array<{ code?: string }> };
type CleanerMeResponse = { cleaner?: { id?: string | null } | null };

export function SupervisorModeSwitcher({ activeMode, forceVisible = false }: { activeMode: ActiveMode; forceVisible?: boolean }) {
  const [visible, setVisible] = useState(forceVisible);
  const [cleanerLinked, setCleanerLinked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await getSupabaseSession();
      const token = session?.access_token;
      if (!token) {
        if (active) setChecked(true);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const [permissionResponse, cleanerResponse] = await Promise.all([
        fetch("/api/admin/security/my-permissions", { headers, cache: "no-store" }).catch(() => null),
        fetch("/api/cleaner/me", { headers, cache: "no-store" }).catch(() => null),
      ]);
      if (!active) return;

      if (!forceVisible && permissionResponse?.ok) {
        const permissionPayload = (await permissionResponse.json().catch(() => ({}))) as PermissionResponse;
        setVisible((permissionPayload.roles ?? []).some((role) => role.code === "supervisor"));
      }

      if (cleanerResponse?.ok) {
        const cleanerPayload = (await cleanerResponse.json().catch(() => ({}))) as CleanerMeResponse;
        setCleanerLinked(Boolean(cleanerPayload.cleaner?.id));
      }
      setChecked(true);
    })();
    return () => { active = false; };
  }, [forceVisible]);

  if (!visible) return null;

  const optionClass = (mode: ActiveMode, disabled = false) =>
    `rounded-lg px-3 py-2 text-xs font-semibold transition ${disabled ? "cursor-not-allowed bg-slate-100 text-slate-400" : activeMode === mode ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`;

  return (
    <section aria-label="Switch between Supervisor and Cleaner accounts" className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Account view</p>
          <p className="mt-0.5 text-xs text-slate-600">Manage your assigned team or open your own cleaner jobs, earnings and profile with the same login.</p>
          {checked && !cleanerLinked ? <p className="mt-1 text-xs font-medium text-amber-700">Cleaner account is not linked to this login yet. Ask the Owner or Manager to link it.</p> : null}
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
          <Link href="/office" className={optionClass("supervisor")} aria-current={activeMode === "supervisor" ? "page" : undefined}>Supervisor</Link>
          {cleanerLinked ? (
            <Link href="/jobs" className={optionClass("cleaner")} aria-current={activeMode === "cleaner" ? "page" : undefined}>My Cleaner Account</Link>
          ) : (
            <span className={optionClass("cleaner", true)} aria-disabled="true">My Cleaner Account</span>
          )}
        </div>
      </div>
    </section>
  );
}
