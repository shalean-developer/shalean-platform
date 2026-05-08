"use client";

type ClarityFn = (command: "set" | "event" | "identify", key: string, value?: string) => void;

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

function safeValue(value: unknown): string {
  if (value == null) return "";
  return String(value).slice(0, 120);
}

export function tagReplay(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.clarity?.("set", key, safeValue(value));
  } catch {
    /* ignore replay provider failures */
  }
}

export function recordReplayEvent(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.clarity?.("event", name);
  } catch {
    /* ignore replay provider failures */
  }
}

export function tagBookingReplayContext(input: {
  bookingSessionId: string;
  routeStep: string;
  funnelStep: string;
  deviceType: "mobile" | "tablet" | "desktop";
}): void {
  tagReplay("analytics_session_id", input.bookingSessionId);
  tagReplay("booking_session_id", input.bookingSessionId);
  tagReplay("booking_route_step", input.routeStep);
  tagReplay("booking_funnel_step", input.funnelStep);
  tagReplay("booking_device_type", input.deviceType);
  recordReplayEvent(`booking_step_${input.routeStep}_view`);
}
