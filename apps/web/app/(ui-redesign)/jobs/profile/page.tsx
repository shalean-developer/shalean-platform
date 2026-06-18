"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  CreditCard,
  FileText,
  HelpCircle,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Settings,
  Shield,
  Star,
} from "lucide-react";
import { signOut } from "@/lib/auth/authClient";
import { useRouter } from "next/navigation";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { mapCleanerMeToMobileProfile } from "@/lib/cleaner/cleanerMobileProfileFromMe";
import { ProfileSummaryCard } from "@/components/cleaner/ProfileSummaryCard";
import type { CleanerMeRow } from "@/lib/cleaner/cleanerMobileProfileFromMe";
import { cn } from "@/lib/utils";

type MeJson = {
  cleaner?: CleanerMeRow | null;
  error?: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

type SettingsRowProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  label: string;
  sub?: string;
  onClick?: () => void;
  destructive?: boolean;
};

function SettingsRow({ icon: Icon, iconBg, iconColor, label, sub, onClick, destructive }: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50",
        destructive ? "text-red-600" : "text-slate-800",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          iconBg,
        )}
      >
        <Icon className={cn("size-4", iconColor)} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", destructive ? "text-red-600" : "text-slate-800")}>
          {label}
        </p>
        {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
      </div>
      <ChevronRight className={cn("size-4 shrink-0", destructive ? "text-red-400" : "text-slate-300")} aria-hidden />
    </button>
  );
}

type InfoRowProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
};

function InfoRow({ icon: Icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
      <div className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm text-slate-800">{value}</p>
      </div>
    </div>
  );
}

const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export default function JobsProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanerRow, setCleanerRow] = useState<CleanerMeRow | null>(null);

  const load = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) { setError("Not signed in."); setLoading(false); return; }
    try {
      const res = await cleanerAuthenticatedFetch("/api/cleaner/me", { headers });
      const j = (await res.json().catch(() => ({}))) as MeJson;
      if (!res.ok || j.error) throw new Error(j.error ?? "Could not load profile.");
      setCleanerRow(j.cleaner ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.replace("/auth/login");
    router.refresh();
  }, [router]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-4 space-y-3 animate-pulse">
        <div className="h-28 rounded-2xl bg-gray-200" />
        <div className="h-24 rounded-2xl bg-gray-200" />
        <div className="h-40 rounded-2xl bg-gray-200" />
        <div className="h-48 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-4">
        <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  const profile = mapCleanerMeToMobileProfile(cleanerRow);
  const name = profile?.name ?? "Cleaner";
  const initials = initialsFromName(name);
  const ratingLabel = profile?.rating != null ? profile.rating.toFixed(1) : null;
  const phone = profile?.phone ?? "—";
  const areas = profile?.areas ?? [];
  const weekdays = profile?.availabilityWeekdays ?? [];
  const availStatus = profile?.isAvailable ? "online" as const : "offline" as const;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-6 space-y-4">
      {/* Profile summary */}
      <ProfileSummaryCard
        name={name}
        initials={initials}
        rating={ratingLabel}
        completedJobs={profile?.jobsCompleted ?? null}
        availabilityStatus={availStatus}
      />

      {/* Contact details */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Contact Details
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          <InfoRow icon={Phone} label="Phone" value={phone} />
          <InfoRow icon={Phone} label="WhatsApp" value={phone} />
          <InfoRow icon={Mail} label="Email" value="On file with Shalean" />
        </div>
      </div>

      {/* Work preferences */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Work Preferences
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          <InfoRow
            icon={MapPin}
            label="Preferred areas"
            value={areas.length > 0 ? areas.join(", ") : "Not set"}
          />
          <InfoRow
            icon={BriefcaseBusiness}
            label="Services offered"
            value="Standard Clean, Deep Clean"
          />
          {weekdays.length > 0 ? (
            <div className="flex items-start gap-3 px-4 py-3">
              <Star className="mt-0.5 size-4 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Available days
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {weekdays.map((d) => (
                    <span
                      key={d}
                      className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700"
                    >
                      {WEEKDAY_LABELS[d] ?? d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Documents */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Documents
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="size-4 text-slate-400" strokeWidth={1.75} aria-hidden />
              <p className="text-sm text-slate-800">ID document</p>
            </div>
            <span className="rounded-full bg-green-50 border border-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
              On file
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <Shield className="size-4 text-slate-400" strokeWidth={1.75} aria-hidden />
              <p className="text-sm text-slate-800">Background check</p>
            </div>
            <span className="rounded-full bg-green-50 border border-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
              Cleared
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <Star className="size-4 text-slate-400" strokeWidth={1.75} aria-hidden />
              <p className="text-sm text-slate-800">Training</p>
            </div>
            <span className="rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
              Completed
            </span>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Settings
          </p>
        </div>
        <SettingsRow
          icon={Bell}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Notifications"
          sub="Manage job and payout alerts"
        />
        <SettingsRow
          icon={Settings}
          iconBg="bg-slate-100"
          iconColor="text-slate-600"
          label="Availability"
          sub="Manage your working days and hours"
        />
        <SettingsRow
          icon={CreditCard}
          iconBg="bg-green-50"
          iconColor="text-green-600"
          label="Bank & payout details"
          sub="Manage your payout account"
        />
        <SettingsRow
          icon={HelpCircle}
          iconBg="bg-orange-50"
          iconColor="text-orange-500"
          label="Help & support"
          sub="Chat, FAQ, and contact us"
        />
        <SettingsRow
          icon={LogOut}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          label="Log out"
          destructive
          onClick={() => void handleLogout()}
        />
      </div>
    </div>
  );
}
