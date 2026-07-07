"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, CheckCircle2 } from "lucide-react";
import { ProfileSettingsBackLink } from "@/components/cleaner/ProfileSettingsBackLink";
import { cn } from "@/lib/utils";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

function permissionLabel(state: PermissionState): string {
  if (state === "granted") return "Enabled";
  if (state === "denied") return "Blocked";
  if (state === "default") return "Not enabled";
  return "Not supported";
}

function permissionDescription(state: PermissionState): string {
  if (state === "granted") {
    return "You'll get desktop alerts when new jobs arrive, payouts fail, or important updates land.";
  }
  if (state === "denied") {
    return "Notifications are blocked in your browser. Open your browser settings for this site and allow notifications.";
  }
  if (state === "default") {
    return "Turn on browser alerts so you never miss a new job offer or payout update.";
  }
  return "Your browser doesn't support desktop notifications. In-app alerts still work while you're on the jobs app.";
}

export default function ProfileNotificationsPage() {
  const [permission, setPermission] = useState<PermissionState>("unsupported");
  const [requesting, setRequesting] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  const syncPermission = useCallback(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    const p = Notification.permission;
    setPermission(p === "granted" ? "granted" : p === "denied" ? "denied" : "default");
  }, []);

  useEffect(() => {
    syncPermission();
  }, [syncPermission]);

  const requestNotifications = async () => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result === "granted" ? "granted" : result === "denied" ? "denied" : "default");
      if (result === "granted") {
        setJustEnabled(true);
        try {
          new Notification("Notifications enabled", {
            body: "We'll alert you when new jobs and payout updates arrive.",
          });
        } catch {
          /* ignore — permission granted but show failed */
        }
      }
    } finally {
      setRequesting(false);
    }
  };

  const StatusIcon = permission === "granted" ? BellRing : permission === "denied" ? BellOff : Bell;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-6 space-y-4">
      <ProfileSettingsBackLink />
      <div>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Notifications</h1>
        <p className="mt-0.5 text-sm text-slate-400">Manage job and payout alerts</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
            <StatusIcon className="size-5 text-blue-600" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">Browser alerts</p>
            <p
              className={cn(
                "mt-0.5 text-xs font-semibold uppercase tracking-wide",
                permission === "granted"
                  ? "text-green-600"
                  : permission === "denied"
                    ? "text-red-600"
                    : "text-amber-600",
              )}
            >
              {permissionLabel(permission)}
            </p>
            <p className="mt-2 text-sm text-slate-500">{permissionDescription(permission)}</p>
          </div>
        </div>

        {permission === "default" ? (
          <div className="border-t border-gray-50 px-4 py-3">
            <button
              type="button"
              onClick={() => void requestNotifications()}
              disabled={requesting}
              className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {requesting ? "Requesting…" : "Enable notifications"}
            </button>
          </div>
        ) : null}
      </div>

      {justEnabled ? (
        <div className="flex items-start gap-2 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Notifications are on. You&apos;ll get alerts even when another tab is open.</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
        <div className="px-4 py-3.5">
          <p className="text-sm font-medium text-slate-800">Job offers</p>
          <p className="mt-0.5 text-xs text-slate-400">Alert when a new job is offered to you</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-sm font-medium text-slate-800">Payout updates</p>
          <p className="mt-0.5 text-xs text-slate-400">Alert when a payout is sent or fails</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-sm font-medium text-slate-800">In-app inbox</p>
          <p className="mt-0.5 text-xs text-slate-400">
            All alerts also appear in the bell icon on your jobs home screen.
          </p>
        </div>
      </div>
    </div>
  );
}
