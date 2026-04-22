"use client";

import { useSyncExternalStore } from "react";
import {
  BOOKING_CLEANER_EVENT,
  BOOKING_CLEANER_KEY,
  readSelectedCleanerFromStorage,
  type SelectedCleanerSnapshot,
} from "@/lib/booking/cleanerSelection";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === BOOKING_CLEANER_KEY || e.key === null) callback();
  };
  const onCustom = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener(BOOKING_CLEANER_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(BOOKING_CLEANER_EVENT, onCustom);
  };
}

function getSnapshot(): SelectedCleanerSnapshot | null {
  return readSelectedCleanerFromStorage();
}

function getServerSnapshot(): null {
  return null;
}

export function useSelectedCleaner(): SelectedCleanerSnapshot | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
