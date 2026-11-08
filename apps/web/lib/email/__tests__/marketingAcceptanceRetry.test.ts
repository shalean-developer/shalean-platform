import { expect, it, vi } from "vitest";
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/resendFrom", () => ({ getResend: provider }));
import { safeResendSend } from "../safeResendSend";
it.each([
  { context: { messageType: "marketing_acceptance_test" } },
  { tags: [{ name: "message_type", value: "marketing_acceptance_test" }] },
])("refuses dedicated test messages through every normal send/retry entry", async metadata => {
  const result = await safeResendSend({ from: "Shalean <hello@shalean.co.za>", to: "first@example.test", subject: "Test", text: "test", ...metadata });
  expect(result.error?.name).toBe("acceptance_test_blocked"); expect(provider).not.toHaveBeenCalled();
});
