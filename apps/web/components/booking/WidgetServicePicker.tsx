"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Plus, RefreshCw, Sparkles } from "lucide-react";
import { ROOM_FIELD_LABEL_CLASS } from "@/components/ui/floating-select";
import {
  WIDGET_SERVICE_GROUPS,
  type WidgetServiceGroupDef,
  type WidgetServiceGroupId,
} from "@/lib/booking/widgetServiceGroups";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import { cn } from "@/lib/utils";

/** Light mint base + deep emerald badge (reference UI). */
const ICON_MINT = "text-[#A8CBB9] dark:text-[#8BB89E]";
const BADGE_EMERALD = "bg-[#1B5E44]";

function ServiceGroupIconCluster({ groupId }: { groupId: WidgetServiceGroupId }) {
  const BaseIcon = groupId === "regular" ? Calendar : Sparkles;
  const BadgeIcon = groupId === "regular" ? RefreshCw : Plus;
  return (
    <div className="relative h-11 w-11 shrink-0" aria-hidden>
      <BaseIcon className={cn("absolute left-0 top-0 h-11 w-11 stroke-[1.25]", ICON_MINT)} />
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white dark:ring-zinc-900",
          BADGE_EMERALD,
          "shadow-sm",
        )}
      >
        <BadgeIcon className="h-3 w-3 text-white" strokeWidth={2.5} />
      </span>
    </div>
  );
}

export type WidgetServicePickerView = "groups" | "services";

export type WidgetServicePickerProps = {
  value: HomeWidgetServiceKey;
  onChange: (service: HomeWidgetServiceKey) => void;
  /** Accessible label id for the field label */
  labelId?: string;
  className?: string;
  /** Fires when the user switches between category cards and the service list. */
  onViewChange?: (view: WidgetServicePickerView) => void;
  /** Smaller titles when embedded in booking step 1 (hero keeps default). */
  embedded?: boolean;
};

export function WidgetServicePicker({
  value,
  onChange,
  labelId,
  className,
  onViewChange,
  embedded = false,
}: WidgetServicePickerProps) {
  const [openGroupId, setOpenGroupId] = useState<WidgetServiceGroupId | null>(null);

  const openGroup: WidgetServiceGroupDef | null = useMemo(() => {
    if (!openGroupId) return null;
    return WIDGET_SERVICE_GROUPS.find((g) => g.id === openGroupId) ?? null;
  }, [openGroupId]);

  useEffect(() => {
    onViewChange?.(openGroupId ? "services" : "groups");
  }, [openGroupId, onViewChange]);

  return (
    <div className={cn("space-y-2", className)}>
      {!openGroupId ? (
        <>
          <div className={cn("text-center", embedded ? "mb-4 md:mb-5" : "mb-6 md:mb-8")}>
            <h2
              id={labelId}
              className={cn(
                "font-bold tracking-tight text-zinc-900 dark:text-zinc-50",
                embedded ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl",
              )}
            >
              Choose cleaning service
            </h2>
            <p className={cn("text-zinc-600 dark:text-zinc-400", embedded ? "mt-1 text-sm" : "mt-2 text-base")}>
              Category, then service type.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4" role="list">
            {WIDGET_SERVICE_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                role="listitem"
                aria-label={`${group.name}. ${group.description}`}
                onClick={() => setOpenGroupId(group.id)}
                className={cn(
                  "min-w-0 rounded-xl border border-zinc-200/90 bg-white p-4 text-left shadow-md transition sm:p-5",
                  "hover:border-emerald-300/80 hover:shadow-lg",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                  "dark:border-zinc-600/90 dark:bg-zinc-900 dark:shadow-black/20 dark:hover:border-emerald-600/50",
                )}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <ServiceGroupIconCluster groupId={group.id} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold leading-tight text-zinc-900 sm:text-base dark:text-zinc-50">
                      {group.name}
                    </h3>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-500 sm:text-xs dark:text-zinc-400">
                      {group.subtitle}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div>
          <span
            id={labelId}
            className={cn("mb-3 block", ROOM_FIELD_LABEL_CLASS)}
          >
            Cleaning service
          </span>
          <button
            type="button"
            onClick={() => setOpenGroupId(null)}
            className="mb-4 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Categories
          </button>
          <div
            className={cn(
              "grid min-w-0 gap-2 sm:gap-3",
              !openGroup || openGroup.services.length === 1
                ? "grid-cols-1"
                : openGroup.services.length >= 3
                  ? "grid-cols-3"
                  : "grid-cols-2",
            )}
          >
            {openGroup?.services.map((service) => {
              const selected = value === service.id;
              return (
                <button
                  key={service.id}
                  type="button"
                  aria-label={`${service.name}. ${service.subtitle}`}
                  onClick={() => onChange(service.id)}
                  className={cn(
                    "min-w-0 rounded-xl border p-3 text-left transition sm:rounded-2xl sm:p-4",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                    selected
                      ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                      : "border-zinc-200 bg-white hover:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-500",
                  )}
                >
                  <p className="text-sm font-semibold leading-tight text-zinc-900 sm:text-base dark:text-zinc-50">
                    {service.name}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500 sm:text-xs dark:text-zinc-400">
                    {service.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
