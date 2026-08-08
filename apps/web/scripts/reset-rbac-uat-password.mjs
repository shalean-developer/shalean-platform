import { createClient } from "@supabase/supabase-js";

const allowedEmails = new Set([
  "rbac-owner@shalean.test",
  "rbac-manager@shalean.test",
  "rbac-operations@shalean.test",
  "rbac-finance@shalean.test",
  "rbac-customer-care@shalean.test",
  "rbac-workforce@shalean.test",
  "rbac-marketing@shalean.test",
  "rbac-supervisor@shalean.test",
]);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const email = String(readArg("--email") ?? "").trim().toLowerCase();
const password = process.env.UAT_NEW_PASSWORD ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const expectedProjectRef = process.env.UAT_SUPABASE_PROJECT_REF ?? "";
const confirmation = process.env.UAT_PASSWORD_RESET_CONFIRM ?? "";

if (!allowedEmails.has(email)) {
  fail(`Refusing reset: ${email || "<missing email>"} is not an approved RBAC UAT account.`);
}
if (password.length < 12) {
  fail("Refusing reset: UAT_NEW_PASSWORD must be at least 12 characters.");
}
if (!supabaseUrl || !serviceRoleKey) {
  fail("Missing staging Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
}
if (confirmation !== "STAGING_RBAC_UAT_ONLY") {
  fail("Refusing reset: set UAT_PASSWORD_RESET_CONFIRM=STAGING_RBAC_UAT_ONLY.");
}

let projectRef;
try {
  const host = new URL(supabaseUrl).hostname;
  projectRef = host.endsWith(".supabase.co") ? host.split(".")[0] : "";
} catch {
  fail("Invalid Supabase URL.");
}

if (!expectedProjectRef || !projectRef || projectRef !== expectedProjectRef) {
  fail("Refusing reset: UAT_SUPABASE_PROJECT_REF must exactly match the project ref in the supplied Supabase URL.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let target = null;
let page = 1;
const perPage = 200;
while (!target) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
  if (error) fail(`Could not list staging Auth users: ${error.message}`);
  target = data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
  if (target || data.users.length < perPage) break;
  page += 1;
}

if (!target) {
  fail(`UAT account not found in this Supabase project: ${email}`);
}

const { error: updateError } = await supabase.auth.admin.updateUserById(target.id, {
  password,
  email_confirm: true,
});

if (updateError) {
  fail(`Password reset failed for ${email}: ${updateError.message}`);
}

console.log(`Password reset complete for ${email}.`);
console.log(`Supabase project ref: ${projectRef}`);
console.log("The password was read from UAT_NEW_PASSWORD and was not written to the repository or logs.");
