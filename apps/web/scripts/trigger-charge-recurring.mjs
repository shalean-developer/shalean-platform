import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[k] = v;
}

const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error("CRON_SECRET missing");
  process.exit(1);
}

const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://shalean.co.za";
const host = /localhost|127\.0\.0\.1/i.test(base) ? "https://shalean.co.za" : base.replace(/\/$/, "");
const url = `${host}/api/cron/charge-recurring-bookings`;
console.log("POST", url);

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "x-cron-secret": secret,
    "Content-Type": "application/json",
  },
  body: "{}",
});

const text = await res.text();
console.log("Status:", res.status);
console.log("Body:", text.slice(0, 400));
