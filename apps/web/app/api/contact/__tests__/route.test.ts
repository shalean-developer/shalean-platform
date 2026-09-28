import { beforeEach, describe, expect, it, vi } from "vitest";

const safeResendSend = vi.fn();
const getDefaultFromAddress = vi.fn(() => "Shalean Cleaning <hello@shalean.co.za>");

vi.mock("@/lib/email/safeResendSend", () => ({
  safeResendSend,
}));

vi.mock("@/lib/email/resendFrom", () => ({
  getDefaultFromAddress,
}));

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    safeResendSend.mockResolvedValue({ data: { id: "re_test" }, error: null });
  });

  async function post(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/contact/route");
    return POST(
      new Request("https://shalean.co.za/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  it("sends only to hello@shalean.co.za and uses the visitor as Reply-To", async () => {
    const response = await post({
      name: "Farai",
      email: "Farai@example.com",
      phone: "+27 82 000 0000",
      topic: "reschedule",
      message: "Please help me change my booking.",
      company: "",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(safeResendSend).toHaveBeenCalledTimes(1);

    const payload = safeResendSend.mock.calls[0]?.[0];
    expect(payload.to).toBe("hello@shalean.co.za");
    expect(payload.replyTo).toBe("farai@example.com");
    expect(payload.subject).toContain("Reschedule");
    expect(payload.text).toContain("Please help me change my booking.");
    expect(payload.context).toEqual({ messageType: "website_contact_form" });
  });

  it("rejects invalid visitor email without sending", async () => {
    const response = await post({
      name: "Farai",
      email: "not-an-email",
      topic: "general",
      message: "Hello",
      company: "",
    });

    expect(response.status).toBe(400);
    expect(safeResendSend).not.toHaveBeenCalled();
  });

  it("silently accepts honeypot submissions without sending", async () => {
    const response = await post({
      name: "Bot",
      email: "bot@example.com",
      topic: "general",
      message: "Spam",
      company: "Spam Company",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(safeResendSend).not.toHaveBeenCalled();
  });

  it("returns a user-safe error when email delivery fails", async () => {
    safeResendSend.mockResolvedValue({
      data: null,
      error: { message: "provider unavailable", name: "provider_error" },
    });

    const response = await post({
      name: "Farai",
      email: "farai@example.com",
      topic: "business",
      message: "Please contact me.",
      company: "",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "We could not send your message right now. Please try again.",
    });
  });
});
