import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch (error) {
  console.error("Production dependency audit returned invalid JSON.");
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const allowlisted = new Set([
  "https://github.com/advisories/GHSA-2v37-7h3g-55p8",
]);

const blocking = [];
const acknowledged = [];

for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  const severity = String(vulnerability?.severity ?? "").toLowerCase();
  if (severity !== "high" && severity !== "critical") continue;

  const advisoryUrls = (Array.isArray(vulnerability?.via) ? vulnerability.via : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => String(entry.url ?? ""))
    .filter(Boolean);

  const isTemporaryNanoidException =
    packageName === "nanoid" &&
    advisoryUrls.length > 0 &&
    advisoryUrls.every((url) => allowlisted.has(url));

  if (isTemporaryNanoidException) {
    acknowledged.push({ packageName, severity, advisoryUrls });
  } else {
    blocking.push({ packageName, severity, advisoryUrls });
  }
}

if (acknowledged.length > 0) {
  console.warn("Temporary production-audit exception in effect:");
  for (const item of acknowledged) {
    console.warn(`- ${item.packageName} (${item.severity}): ${item.advisoryUrls.join(", ")}`);
  }
  console.warn(
    "Reason: PostCSS currently resolves nanoid 3.3.16 and the patched 3.3.17 release is not yet available to npm installs. Remove this exception as soon as a compatible patched release is published.",
  );
}

if (blocking.length > 0) {
  console.error("Blocking high/critical production dependency vulnerabilities detected:");
  for (const item of blocking) {
    console.error(`- ${item.packageName} (${item.severity}): ${item.advisoryUrls.join(", ") || "no advisory URL reported"}`);
  }
  process.exit(1);
}

console.log("Production dependency audit passed with no unapproved high/critical vulnerabilities.");
