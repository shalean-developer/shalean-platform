import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function source(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("SR-09A email recovery consolidation", () => {
  it("normalizes thrown Resend failures before durable recovery persistence", () => {
    const src = source("lib/email/safeResendSend.ts");

    expect(src).toContain("try {");
    expect(src).toContain("await resend.emails.send");
    expect(src).toContain("catch (error)");
    expect(src).toContain("result = thrownResendError(error)");
    expect(src.indexOf("result = thrownResendError(error)")).toBeLessThan(
      src.indexOf('from("email_outbound_messages").insert'),
    );
  });

  it("keeps retries on the claimed original recovery row", () => {
    const wrapper = source("lib/email/safeResendSend.ts");
    const worker = source("app/api/cron/retry-failed-emails/route.ts");

    expect(wrapper).toContain("recordRecovery?: boolean");
    expect(wrapper).toContain("recordRecovery = true");
    expect(wrapper).toContain("const admin = recordRecovery ? getSupabaseAdmin() : null");
    expect(worker).toContain("recordRecovery: false");
    expect(worker).toContain('from("email_outbound_messages").update');
  });
});
