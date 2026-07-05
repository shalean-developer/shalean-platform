import { describe, expect, it } from "vitest";
import { retiredApiJson } from "@/lib/http/retiredApiRoute";

describe("retiredApiJson", () => {
  it("returns 410 with optional Link successor header", async () => {
    const res = retiredApiJson({
      message: "Retired endpoint.",
      successor: "/api/customer/bookings",
    });
    expect(res.status).toBe(410);
    const json = (await res.json()) as { error: string; retired: boolean; successor: string };
    expect(json).toEqual({
      error: "Retired endpoint.",
      retired: true,
      successor: "/api/customer/bookings",
    });
    expect(res.headers.get("Link")).toBe("</api/customer/bookings>; rel=\"successor-version\"");
  });
});
