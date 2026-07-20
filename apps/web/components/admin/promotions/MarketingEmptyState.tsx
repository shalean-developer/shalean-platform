"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import {
  getEmptyStateCopy,
  type EmptyStateKey,
} from "@/lib/promotions/marketingUx";
import { cn } from "@/lib/utils";

export function MarketingEmptyState({
  stateKey,
  className,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  stateKey?: EmptyStateKey;
  className?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const copy = stateKey ? getEmptyStateCopy(stateKey) : null;
  const resolvedTitle = title ?? copy?.title ?? "Nothing here yet";
  const resolvedDescription =
    description ?? copy?.description ?? "Try another filter or create content to continue.";
  const resolvedActionLabel = actionLabel ?? copy?.actionLabel;
  const resolvedActionHref = actionHref ?? copy?.actionHref;

  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center",
        className,
      )}
    >
      <Inbox className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-slate-900">{resolvedTitle}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{resolvedDescription}</p>
      {resolvedActionLabel && (resolvedActionHref || onAction) ? (
        <p className="mt-4">
          {onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-sm font-medium text-blue-700 underline hover:text-blue-900"
            >
              {resolvedActionLabel}
            </button>
          ) : (
            <Link
              href={resolvedActionHref!}
              className="text-sm font-medium text-blue-700 underline hover:text-blue-900"
            >
              {resolvedActionLabel}
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}

export function MarketingSectionSkeleton({
  label = "Loading…",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
