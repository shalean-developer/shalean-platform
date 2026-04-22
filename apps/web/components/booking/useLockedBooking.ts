"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  BOOKING_LOCKED_EVENT,
  BOOKING_LOCKED_KEY,
  readLockedBookingFromStorage,
  type LockedBooking,
} from "@/lib/booking/lockedBooking";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === BOOKING_LOCKED_KEY || e.key === null) callback();
  };
  const onCustom = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener(BOOKING_LOCKED_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(BOOKING_LOCKED_EVENT, onCustom);
  };
}

function getSnapshot(): LockedBooking | null {
  return readLockedBookingFromStorage();
}

function getServerSnapshot(): null {
  return null;
}

/** Subscribes to `booking_locked` in localStorage (same-tab + other tabs). */
export function useLockedBooking(): LockedBooking | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsBookingLocked(): boolean {
  const locked = useLockedBooking();
  return locked != null;
}

export function useLockedBookingRefresh() {
  return useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(BOOKING_LOCKED_EVENT));
    }
  }, []);
}
