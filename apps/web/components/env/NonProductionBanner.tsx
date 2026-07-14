import { resolveDeploymentEnvironment } from "@/lib/env/deploymentEnvironment";

/**
 * Visible STAGING / DEVELOPMENT banner. Invisible in production.
 */
export function NonProductionBanner() {
  const env = resolveDeploymentEnvironment();
  if (env === "production") return null;

  const label =
    env === "staging"
      ? "STAGING"
      : env === "development"
        ? "DEVELOPMENT"
        : env === "preview"
          ? "PREVIEW"
          : "LOCAL";

  const tone =
    env === "staging"
      ? "bg-amber-600 text-white"
      : env === "development"
        ? "bg-sky-700 text-white"
        : "bg-slate-700 text-white";

  return (
    <div
      role="status"
      data-shalean-env={env}
      className={`w-full px-3 py-1.5 text-center text-xs font-semibold tracking-wide ${tone}`}
    >
      SHALEAN {label} — test environment · do not use for customer traffic
    </div>
  );
}
