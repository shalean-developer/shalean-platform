/**
 * Send a test admin notification email.
 * Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/sendTestAdminNotification.ts
 */
import { sendAdminHtmlEmail } from "../lib/email/sendBookingEmail";

const to = (process.env.ADMIN_NOTIFICATION_EMAIL || "").split(",")[0]?.trim();
console.log("ADMIN_NOTIFICATION_EMAIL (first):", to || "MISSING");

async function main() {
  const result = await sendAdminHtmlEmail({
    subject: "Shalean admin notification test",
    html:
      "<p>If you received this, admin operational emails are working.</p><p>Sent at " +
      new Date().toISOString() +
      "</p>",
    context: { type: "admin_test" },
  });

  console.log("Result:", result);
  process.exit(result.sent ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
