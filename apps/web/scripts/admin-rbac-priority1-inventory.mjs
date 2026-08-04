#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "../..");
const checkOnly = process.argv.includes("--check");
const outputPath = resolve(repoRoot, "docs/security/admin-rbac-priority-1-inventory.generated.md");

const textExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".sql"]);
const criticalFinance = [
  "financial-dashboard",
  "business-health",
  "cash-flow",
  "expenses",
  "recurring-expenses",
  "budgets",
  "expense-vendors",
  "expense-reports",
  "payment-reconciliation",
  "booking-profitability",
];
const criticalPayout = ["payout", "payouts", "earning", "earnings", "disbursement", "transfer"];
const criticalIdentity = ["bank", "payment-details", "identity", "document", "documents", "id-document"];
const criticalAdmin = ["role", "roles", "permission", "permissions", "admin-user", "admin-users"];

function walk(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const name of readdirSync(root)) {
    if (["node_modules", ".next", ".git", "coverage"].includes(name)) continue;
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}
function posix(path) { return relative(repoRoot, path).split(sep).join("/"); }
function source(path) { return readFileSync(path, "utf8"); }
function lowerPath(path) { return posix(path).toLowerCase(); }
function hasAny(path, needles) { const p = lowerPath(path); return needles.some((n) => p.includes(n)); }
function routeOperation(src) {
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(src));
  return methods.join(", ") || "route";
}
function currentGuard(src) {
  const match = src.match(/(requireAdminPermissionFromRequest|requireFinanceApi|requireAdminFromRequest|requireAdminUser|requireAdminSession|isAdmin)\b/);
  return match?.[1] ?? "none detected";
}
function permission(src) {
  const direct = src.match(/requireAdminPermissionFromRequest\s*\([^,]+,\s*["'`]([^"'`]+)["'`]/s);
  if (direct) return direct[1];
  if (src.includes("requireFinanceApi")) return "finance.full.view (shared gate)";
  return "unmapped";
}
function proposed(path) {
  if (hasAny(path, criticalPayout)) {
    if (lowerPath(path).includes("approve")) return "payout.approve";
    if (/(pay|release|run|transfer)/.test(lowerPath(path))) return "payout.release";
    return "payout.prepare or payout.view";
  }
  if (hasAny(path, criticalIdentity)) {
    if (/(download|document|identity)/.test(lowerPath(path))) return "cleaner.documents.view";
    return "cleaner.bank.view";
  }
  if (hasAny(path, criticalFinance)) return "finance.full.view";
  if (hasAny(path, criticalAdmin)) return "role.manage";
  return "inventory review";
}
function sensitivity(path) {
  if (hasAny(path, criticalIdentity)) return "highly sensitive";
  if (hasAny(path, criticalFinance) || hasAny(path, criticalPayout)) return "financial";
  if (hasAny(path, criticalAdmin)) return "highly sensitive";
  return "internal";
}
function protectedCritical(path, src) {
  if (hasAny(path, criticalFinance)) return src.includes("requireFinanceApi") || /finance\.(full|summary)\.view/.test(src);
  if (hasAny(path, criticalPayout)) return /payout\.(view|prepare|approve|release)/.test(src);
  if (hasAny(path, criticalIdentity)) return /cleaner\.(bank|documents)\.view/.test(src);
  if (hasAny(path, criticalAdmin)) return /role\.manage|user\.manage/.test(src);
  return true;
}

const officePages = walk(resolve(webRoot, "app")).filter((p) => /\/office\//.test(p.split(sep).join("/")) && /\/(page|layout)\.(tsx|ts)$/.test(p.split(sep).join("/")));
const apiRoutes = walk(resolve(webRoot, "app/api")).filter((p) => /\/route\.(ts|js)$/.test(p.split(sep).join("/")));
const sourceFiles = walk(webRoot).filter((p) => textExt.has(p.slice(p.lastIndexOf("."))));
const migrations = walk(resolve(repoRoot, "supabase/migrations")).filter((p) => p.endsWith(".sql"));

const apiRows = apiRoutes.map((path) => {
  const src = source(path);
  const isCritical = hasAny(path, [...criticalFinance, ...criticalPayout, ...criticalIdentity, ...criticalAdmin]);
  return {
    resource: posix(path), operation: routeOperation(src), guard: currentGuard(src), permission: permission(src),
    proposed: proposed(path), sensitivity: sensitivity(path), critical: isCritical, protected: protectedCritical(path, src),
  };
});
const rpcNames = new Set();
for (const path of sourceFiles) {
  const src = source(path);
  for (const match of src.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)) rpcNames.add(match[1]);
}
for (const path of migrations) {
  const src = source(path);
  for (const match of src.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)) rpcNames.add(match[1]);
}
const failures = apiRows.filter((r) => r.critical && !r.protected);

const lines = [
  "# Admin RBAC Priority 1 — Generated Inventory",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `- Office page/layout files: **${officePages.length}**`,
  `- API route files: **${apiRows.length}**`,
  `- RPC/database functions referenced or defined: **${rpcNames.size}**`,
  `- Unprotected critical API routes: **${failures.length}**`,
  "",
  "## Office pages and layouts",
  "",
  "| Resource | Proposed permission | Sensitivity |",
  "|---|---|---|",
  ...officePages.sort().map((p) => `| \`${posix(p)}\` | \`${proposed(p)}\` | ${sensitivity(p)} |`),
  "",
  "## API routes",
  "",
  "| Resource | Operation | Current guard | Current permission | Proposed permission | Sensitivity | Critical status |",
  "|---|---|---|---|---|---|---|",
  ...apiRows.sort((a,b) => a.resource.localeCompare(b.resource)).map((r) => `| \`${r.resource}\` | ${r.operation} | \`${r.guard}\` | \`${r.permission}\` | \`${r.proposed}\` | ${r.sensitivity} | ${r.critical ? (r.protected ? "PASS" : "FAIL") : "review"} |`),
  "",
  "## RPC and database functions",
  "",
  ...[...rpcNames].sort().map((name) => `- \`${name}\``),
  "",
  "## Priority 1 failures",
  "",
  ...(failures.length ? failures.map((r) => `- \`${r.resource}\` requires \`${r.proposed}\`; detected guard: \`${r.guard}\`.`) : ["No unprotected critical API routes detected by the static policy audit."]),
  "",
  "## Scope note",
  "",
  "This inventory is generated from the repository filesystem. The static audit fails CI when a critical finance, payout, cleaner identity/bank, or role-administration route lacks a matching granular RBAC permission. Runtime authorization tests remain responsible for proving 401/403 behavior and record scope.",
  "",
];
const output = lines.join("\n");
if (!checkOnly) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
  console.log(`Wrote ${relative(repoRoot, outputPath)}`);
}
console.log(JSON.stringify({ officePages: officePages.length, apiRoutes: apiRows.length, rpcFunctions: rpcNames.size, failures: failures.map((r) => r.resource) }, null, 2));
if (failures.length) process.exitCode = 1;
