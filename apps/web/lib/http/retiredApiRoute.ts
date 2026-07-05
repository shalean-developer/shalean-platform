import { NextResponse } from "next/server";

export type RetiredApiOptions = {
  /** Human-readable reason the route was removed. */
  message: string;
  /** Canonical replacement path (no host), e.g. `/api/customer/bookings`. */
  successor?: string;
};

/** Standard 410 Gone response for retired booking/API endpoints. */
export function retiredApiJson(options: RetiredApiOptions): NextResponse {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.successor) {
    headers.set("Link", `<${options.successor}>; rel="successor-version"`);
  }
  return NextResponse.json(
    {
      error: options.message,
      retired: true,
      ...(options.successor ? { successor: options.successor } : {}),
    },
    { status: 410, headers },
  );
}
