import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("notificationRouter imports (static guard)", () => {
  it("does not import raw SMS/email provider modules (delegates via notifyBookingEvent only)", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/notificationRouter.ts"), "utf8");
    expect(src).not.toMatch(/@\/lib\/email\//);
    expect(src).not.toMatch(/@\/lib\/notifications\/smsFallback/);
    expect(src).not.toMatch(/twilio|sendgrid|resend|mailgun/i);
  });
});
