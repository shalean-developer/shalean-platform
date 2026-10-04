import { beforeEach, describe, expect, it, vi } from "vitest";

const directSend = vi.fn();
const safeResendSend = vi.fn();
const assertNotSeedEmail = vi.fn();
let deployment: "production" | "staging" | "development" | "preview" | "local" = "staging";

vi.mock("@/lib/email/resendFrom", () => ({
  getDefaultFromAddress: () => "Shalean Cleaning <hello@shalean.co.za>",
  getResend: () => ({
    emails: { send: directSend },
  }),
}));

vi.mock("@/lib/email/safeResendSend", () => ({
  safeResendSend,
}));

vi.mock("@/lib/seed/devSeedGuard", () => ({
  assertNotSeedEmail,
}));

vi.mock("@/lib/env/deploymentEnvironment", () => ({
  resolveDeploymentDisplayEnvironment: () => deployment,
}));

describe("sendInternalContactFormEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deployment = "staging";
    directSend.mockResolvedValue({ data: { id: "re_test" }, error: null });
    safeResendSend.mockResolvedValue({ data: { id: "re_safe" }, error: null });
  });

  const input = {
    replyTo: "visitor@example.com",
    subject: "Website contact: Reschedule — Visitor",
    text: "Hello",
    html: "<p>Hello</p>",
  };

  it("uses the narrow pricing-test direct sender with seed guard and staging marker", async () => {
    const { sendInternalContactFormEmail } = await import("@/lib/contact/sendInternalContactFormEmail");

    const result = await sendInternalContactFormEmail(input);

    expect(result).toEqual({ sent: true });
    expect(assertNotSeedEmail).toHaveBeenCalledWith(
      "hello@shalean.co.za",
      "website-contact-form",
    );
    expect(directSend).toHaveBeenCalledTimes(1);
    expect(safeResendSend).not.toHaveBeenCalled();

    const payload = directSend.mock.calls[0]?.[0];
    expect(payload.to).toBe("hello@shalean.co.za");
    expect(payload.replyTo).toBe("visitor@example.com");
    expect(payload.subject).toBe(
      "[SHALEAN STAGING — TEST] Website contact: Reschedule — Visitor",
    );
    expect(payload.tags).toEqual([{ name: "message_type", value: "website_contact_form" }]);
  });

  it("uses safeResendSend in production so provider failures remain recoverable", async () => {
    deployment = "production";
    const { sendInternalContactFormEmail } = await import("@/lib/contact/sendInternalContactFormEmail");

    const result = await sendInternalContactFormEmail(input);

    expect(result).toEqual({ sent: true });
    expect(directSend).not.toHaveBeenCalled();
    expect(safeResendSend).toHaveBeenCalledTimes(1);

    const payload = safeResendSend.mock.calls[0]?.[0];
    expect(payload.to).toBe("hello@shalean.co.za");
    expect(payload.replyTo).toBe("visitor@example.com");
    expect(payload.subject).toBe(input.subject);
    expect(payload.context).toEqual({ messageType: "website_contact_form" });
  });

  it("keeps local/development/preview behind the standard outbound safety wrapper", async () => {
    deployment = "local";
    const { sendInternalContactFormEmail } = await import("@/lib/contact/sendInternalContactFormEmail");

    await sendInternalContactFormEmail(input);

    expect(directSend).not.toHaveBeenCalled();
    expect(safeResendSend).toHaveBeenCalledTimes(1);
  });

  it("returns direct staging provider failures to the route", async () => {
    directSend.mockResolvedValue({ data: null, error: { message: "provider rejected" } });

    const { sendInternalContactFormEmail } = await import("@/lib/contact/sendInternalContactFormEmail");
    const result = await sendInternalContactFormEmail(input);

    expect(result).toEqual({ sent: false, error: "provider rejected" });
  });

  it("returns safe-wrapper failures in production", async () => {
    deployment = "production";
    safeResendSend.mockResolvedValue({
      data: null,
      error: { message: "provider unavailable", name: "provider_error" },
    });

    const { sendInternalContactFormEmail } = await import("@/lib/contact/sendInternalContactFormEmail");
    const result = await sendInternalContactFormEmail(input);

    expect(result).toEqual({ sent: false, error: "provider unavailable" });
  });
});
