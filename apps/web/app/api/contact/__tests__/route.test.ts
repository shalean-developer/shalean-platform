import { beforeEach, describe, expect, it, vi } from "vitest";

const sendInternalContactFormEmail = vi.fn();

vi.mock("@/lib/contact/sendInternalContactFormEmail", () => ({
  sendInternalContactFormEmail,
}));

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendInternalContactFormEmail.mockResolvedValue({ sent: true });
  });

  async function post(body: unknown) {
    const { POST } = await import("@/app/api/contact/route");
    return POST(
      new Request("https://shalean.co.za/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  it("delegates a validated enquiry and visitor Reply-To to the internal sender", async () => {
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
    expect(sendInternalContactFormEmail).toHaveBeenCalledTimes(1);

    const payload = sendInternalContactFormEmail.mock.calls[0]?.[0];
    expect(payload.replyTo).toBe("farai@example.com");
    expect(payload.subject).toContain("Reschedule");
    expect(payload.text).toContain("Please help me change my booking.");
  });

  it("rejects non-object JSON without throwing", async () => {
    const response = await post(null);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Invalid request." });
    expect(sendInternalContactFormEmail).not.toHaveBeenCalled();
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
    expect(sendInternalContactFormEmail).not.toHaveBeenCalled();
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
    expect(sendInternalContactFormEmail).not.toHaveBeenCalled();
  });

  it("returns a user-safe error when email delivery fails", async () => {
    sendInternalContactFormEmail.mockResolvedValue({
      sent: false,
      error: "provider unavailable",
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
