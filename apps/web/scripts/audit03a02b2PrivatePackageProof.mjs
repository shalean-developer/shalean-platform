// AUDIT-03A-02B.2: staging-only executable packaging proof.
// Node.js 24, no external imports, no network, no credentials, no financial writes.
// This is NOT the production Zoho audit executor.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function verifyPrivateArtifact(meta, source, env) {
  if (meta?.deployment_environment !== "staging" ||
      meta?.target_host !== "pricing-test.shalean.co.za" ||
      meta?.supabase_ref !== "uwvnmluiqbczeduzjgse" ||
      meta?.server_secrets_baked_in !== false ||
      !/^[a-f0-9]{40}$/.test(String(meta.artifact_sha ?? ""))) {
    throw new Error("Audit staging artifact identity rejected");
  }
  if (env.SHALEAN_APP_ENV !== "staging")
    throw new Error("Audit runtime environment mismatch");
  if (source !== "private") throw new Error("Audit must execute from private runtime directory");
  return {
    audit: "AUDIT-03A-02B.2",
    mode: "private-staging-packaging-proof",
    release_sha: meta.artifact_sha,
    project_ref: meta.supabase_ref,
    external_requests: 0,
    financial_writes: 0,
    live_zoho_audit: false,
  };
}

const script = fileURLToPath(import.meta.url);
if (process.argv[1] === script) {
  try {
    const artifactRoot = new URL("../", import.meta.url);
    if (!script.includes("/private-audit/")) throw new Error("Private directory required");
    const meta = JSON.parse(readFileSync(new URL("build-meta.json", artifactRoot), "utf8"));
    process.stdout.write(JSON.stringify(verifyPrivateArtifact(meta, "private", process.env)) + "\n");
  } catch {
    process.stderr.write("Private staging packaging proof blocked\n");
    process.exitCode = 2;
  }
}
