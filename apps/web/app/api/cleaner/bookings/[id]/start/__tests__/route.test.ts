import { describe, expect, it } from "vitest";
import { POST } from "../route";

describe("POST /api/cleaner/bookings/[id]/start", () => {
  it("returns 410 Gone with jobs API successor", async () => {
    const bookingId = "00000000-0000-4000-8000-000000000004";
    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: bookingId }),
    });
    expect(res.status).toBe(410);
    expect((await res.json()) as { retired?: boolean }).toMatchObject({ retired: true });
  });
});
