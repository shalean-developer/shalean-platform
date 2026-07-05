import { describe, expect, it } from "vitest";
import { POST } from "../route";

describe("POST /api/cleaner/bookings/[id]/accept", () => {
  it("returns 410 Gone with jobs API successor", async () => {
    const bookingId = "00000000-0000-4000-8000-000000000002";
    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: bookingId }),
    });
    expect(res.status).toBe(410);
    const json = (await res.json()) as { retired?: boolean; successor?: string };
    expect(json.retired).toBe(true);
    expect(json.successor).toBe(`/api/cleaner/jobs/${bookingId}`);
    expect(res.headers.get("Link")).toContain("/api/cleaner/jobs/");
  });
});
