"use client";

/** Dispatched when an offline-queued lifecycle flush gets a definitive 4xx (so UI can surface it). */
export const CLEANER_LIFECYCLE_FLUSH_ERROR_EVENT = "cleaner:lifecycle-flush-error" as const;

export type CleanerLifecycleFlushErrorKind = "booking_changed" | "action_failed";

export type CleanerLifecycleFlushErrorDetail = {
  kind: CleanerLifecycleFlushErrorKind;
  status: number;
  message: string;
  bookingId: string;
  action: string;
};

export function emitCleanerLifecycleFlushError(detail: CleanerLifecycleFlushErrorDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLEANER_LIFECYCLE_FLUSH_ERROR_EVENT, { detail }));
}
