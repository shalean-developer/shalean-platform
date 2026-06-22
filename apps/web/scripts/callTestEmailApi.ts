/**
 * Call the running Next.js /api/test-email with secrets from .env.local.
 * Usage: npx tsx --env-file=.env.local scripts/callTestEmailApi.ts
 */
async function main() {
  const secret =
    process.env.EMAIL_TEST_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!secret) {
    console.error("Set EMAIL_TEST_SECRET or CRON_SECRET in .env.local");
    process.exit(1);
  }

  const res = await fetch("http://localhost:3000/api/test-email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: "delivered@resend.dev" }),
  });

  const text = await res.text();
  console.log("status", res.status);
  console.log(text);
}

main();
