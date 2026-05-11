import type { APIRequestContext } from "@playwright/test";

export type CreateLoadTestBookingBody = {
  index?: number;
  dispatchVariant?: "auto" | "user_selected_offer";
  linkUserId?: string;
  customerEmail?: string;
  selectedCleanerId?: string;
};

export async function postDispatchLoadTestBooking(
  request: APIRequestContext,
  secret: string,
  body: CreateLoadTestBookingBody,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await request.post("/api/test/create-booking", {
    headers: {
      "Content-Type": "application/json",
      "x-dispatch-load-test-secret": secret,
    },
    data: body,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { _parseError: true, raw: text.slice(0, 500) };
  }
  return { status: res.status(), json, text };
}
