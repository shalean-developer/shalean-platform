import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@/lib/email/resendFrom", () => ({
  getDefaultFromAddress: () => "Shalean Cleaning <hello@shalean.co.za>",
  getResend: () => ({
    emails: { send },
  }),
}));

describe("sendInternalContactFormEmail", () => {
  const originalEnv = process.env.SHALEAN_APP_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({ data: { id: "re_test" }, error: null });
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SHALEAN_APP_ENV;
    else process.env.SHALEAN_APP_ENV = originalEnv;
  });

  it("always sends to the fixed Shalean inbox and marks staging mail", async () => {
    process.env.SHALEAN_APP_ENV = "staging";
    const { sendInternalContactFormEmail } = await import("@/lib/contact/sendInternalContactFormEmail");

    const result = await sendInternalContactFormEmail({
      replyTo: "visitor@example.com",
      subject: "Website contact: Reschedule — Visitor",
      text: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]?.[0];
    expect(payload.to).toBe("hello@shalean.co.za");
    expect(payload.replyTo).toBe("visitor@example.com");
    expect(payload.subject).toBe(
      "[SHALEAN STAGING — TEST] Website contact: Reschedule — Visitor",
    );
    expect(payload.tags).toEqual([{ name: "message_type", value: "website_contact_form" }]);
  });

  it("does not add a test marker in production", async () => {
    process.env.SHALEAN_APP_ENV = "production";
    const { sendInternalContactFormEmail } = await import("@/lib/contact/sendInternalContactFormEmail");

    await sendInternalContactFormEmail({
      replyTo: "visitor@example.com",
      subject: "Website contact: General enquiry — Visitor",
      text: "Hello",
      html: "<p>Hello</p>",
    });

    expect(send.mock.calls[0]?.[0]?.subject).toBe(
      "Website contact: General enquiry — Visitor",
    );
  });

  it("returns a failure when Resend rejects the internal email", async () => {
    process.env.SHALEAN_APP_ENV = "staging";
    send.mockResolvedValue({ data: null, error: { message: "provider rejected" } });

    const { sendInternalContactFormEmail } = await import("@/lib/contact/sendInternalContactFormEmail");
    const result = await sendInternalContactFormEmail({
      replyTo: "visitor@example.com",
      subject: "Website contact: General enquiry — Visitor",
      text: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result).toEqual({ sent: false, error: "provider rejected" });
  });
});
