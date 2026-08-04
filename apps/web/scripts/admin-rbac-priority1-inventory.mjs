#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "../..");
const outputPath = resolve(repoRoot, "docs/security/admin-rbac-priority-1-inventory.generated.md");
const financeSegments = ["financial-dashboard", "business-health", "cash-flow", "expenses", "recurring-expenses", "budgets", "expense-vendors", "expense-reports", "payment-reconciliation", "booking-profitability"];

function walk(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const name of readdirSync(root)) {
    if (["node_modules", ".next", ".git", "coverage"].includes(name)) continue;
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path)); else out.push(path);
  }
  return out;
}
function posix(path) { return relative(repoRoot, path).split(sep).join("/"); }
function source(path) { return readFileSync(path, "utf8"); }
function normalized(path) { return posix(path).toLowerCase(); }
function isAdminApi(path) { return normalized(path).includes("apps/web/app/api/admin/"); }
function isFinance(path) { const p = normalized(path); return financeSegments.some((s) => p.includes(`/${s}`)); }
function isPayout(path) {
  const p = normalized(path);
  return p.includes("/payout") || p.includes("/cleaners/earnings") || p.includes("/earnings-policies") || p.includes("/adjust-payout-earnings") || p.includes("/fix-earnings") || p.includes("/reset-earnings") || p.includes("/remove-cleaner-payout");
}
function isSensitiveCleaner(path) {
  const p = normalized(path);
  return p.includes("/api/admin/cleaners/") && (p.includes("/bank") || p.includes("/payment-details") || p.includes("/identity") || p.includes("/documents"));
}
function isRoleAdmin(path) {
  const p = normalized(path);
  return p.includes("/api/admin/security/permissions-inspector") || p.includes("/api/admin/roles") || p.includes("/api/admin/admin-users");
}
function criticalKind(path) {
  if (!isAdminApi(path)) return null;
  if (isFinance(path)) return "finance";
  if (isPayout(path)) return "payout";
  if (isSensitiveCleaner(path)) return "cleaner-sensitive";
  if (isRoleAdmin(path)) return "role-admin";
  return null;
}
function operation(src) {
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(src));
  return methods.join(", ") || "route";
}
function guard(src) {
  return src.match(/(requireAdminPermissionFromRequest|requireFinanceApi|requireAdminFromRequest|requireAdminSession|requireAdminUser|isAdmin)\b/)?.[1] ?? "none detected";
}
function directPermission(src) {
  return src.match(/requireAdminPermissionFromRequest\s*\([^,]+,\s*["'`]([^"'`]+)["'`]/s)?.[1] ?? null;
}
function proposed(path, src) {
  const kind = criticalKind(path);
  const p = normalized(path);
  const op = operation(src);
  if (kind === "finance") return "finance.full.view";
  if (kind === "role-admin") return "role.manage";
  if (kind === "cleaner-sensitive") return p.includes("document") || p.includes("identity") ? "cleaner.documents.view" : "cleaner.bank.view";
  if (kind === "payout") {
    if (p.includes("/approve")) return "payout.approve";
    if (p.includes("/pay") || p.includes("/process") || p.includes("/disburse") || p.includes("/mark-paid") || p.includes("/retry")) return "payout.release";
    if (op === "GET") return "payout.view";
    return "payout.prepare";
  }
  return "inventory review";
}
function protectedCritical(path, src) {
  const kind = criticalKind(path);
  if (!kind) return true;
  const sharedMapped = src.includes("requireAdminFromRequest") || src.includes("requireAdminSession");
  if (sharedMapped) return true;
  if (kind === "finance") return src.includes("requireFinanceApi") || /finance\.(full|summary)\.view/.test(src);
  if (kind === "payout") return /payout\.(view|prepare|approve|release)/.test(src);
  if (kind === "cleaner-sensitive") return /cleaner\.(bank|documents)\.view/.test(src);
  if (kind === "role-admin") return /role\.manage|user\.manage/.test(src);
  return false;
}
function sensitivity(path) {
  const kind = criticalKind(path);
  if (kind === "finance" || kind === "payout") return "financial";
  if (kind === "cleaner-sensitive" || kind === "role-admin") return "highly sensitive";
  return "internal";
}

const appFiles = walk(resolve(webRoot, "app"));
const officePages = appFiles.filter((p) => /\/office\//.test(p.split(sep).join("/")) && /\/(page|layout)\.(tsx|ts)$/.test(p.split(sep).join("/")));
const apiRoutes = appFiles.filter((p) => /\/api\/.*\/route\.(ts|js)$/.test(p.split(sep).join("/")));
const sourceFiles = walk(webRoot).filter((p) => /\.(ts|tsx|js|jsx|mjs|sql)$/.test(p));
const migrations = walk(resolve(repoRoot, "supabase/migrations")).filter((p) => p.endsWith(".sql"));

const rows = apiRoutes.map((path) => {
  const src = source(path);
  const kind = criticalKind(path);
  return { resource: posix(path), operation: operation(src), guard: guard(src), permission: directPermission(src) ?? (src.includes("requireFinanceApi") ? "finance.full.view (shared)" : src.includes("requireAdminFromRequest") || src.includes("requireAdminSession") ? "Priority 1 mapped shared gate" : "unmapped"), proposed: proposed(path, src), sensitivity: sensitivity(path), critical: Boolean(kind), protected: protectedCritical(path, src) };
});
const rpcNames = new Set();
for (const path of sourceFiles) for (const match of source(path).matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)) rpcNames.add(match[1]);
for (const path of migrations) for (const match of source(path).matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)) rpcNames.add(match[1]);
const failures = rows.filter((r) => r.critical && !r.protected);

const lines = [
  "# Admin RBAC Priority 1 — Generated Inventory", "", `Generated: ${new Date().toISOString()}`, "",
  `- Office page/layout files: **${officePages.length}**`, `- API route files: **${rows.length}**`, `- RPC/database functions referenced or defined: **${rpcNames.size}**`, `- Unprotected critical admin API routes: **${failures.length}**`, "",
  "## Office pages and layouts", "", "| Resource | Proposed permission | Sensitivity |", "|---|---|---|",
  ...officePages.sort().map((p) => `| \`${posix(p)}\` | \`${proposed(p, "") }\` | ${sensitivity(p)} |`), "",
  "## API routes", "", "| Resource | Operation | Current guard | Current permission | Proposed permission | Sensitivity | Critical status |", "|---|---|---|---|---|---|---|",
  ...rows.sort((a,b) => a.resource.localeCompare(b.resource)).map((r) => `| \`${r.resource}\` | ${r.operation} | \`${r.guard}\` | \`${r.permission}\` | \`${r.proposed}\` | ${r.sensitivity} | ${r.critical ? (r.protected ? "PASS" : "FAIL") : "review"} |`), "",
  "## RPC and database functions", "", ...[...rpcNames].sort().map((n) => `- \`${n}\``), "",
  "## Priority 1 failures", "", ...(failures.length ? failures.map((r) => `- \`${r.resource}\` requires \`${r.proposed}\`; detected guard: \`${r.guard}\`.`) : ["No unprotected critical admin API routes detected by the static policy audit."]), "",
  "## Scope note", "", "Public, customer, cleaner self-service and cron routes are inventoried but are not incorrectly required to use Office-admin permissions. Their own session, signature or cron-secret controls remain separate security boundaries.", ""
];
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, lines.join("\n"));
console.log(`Wrote ${relative(repoRoot, outputPath)}`);
console.log(JSON.stringify({ officePages: officePages.length, apiRoutes: rows.length, rpcFunctions: rpcNames.size, failures: failures.map((r) => r.resource) }, null, 2));
if (failures.length) process.exitCode = 1;
