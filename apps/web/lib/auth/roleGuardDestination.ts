import type { AppUserRole } from "./userRole";

/** Preserve the staging Owner's preference review instead of losing it at the dashboard. */
export function roleGuardDestination(input: {
  requiredRole: AppUserRole; actualRole: AppUserRole; actualRoute: string;
  pathname: string; appEnv?: string; hostname: string;
}): string {
  if (input.requiredRole === "customer" && input.actualRole === "admin"
    && input.pathname.replace(/\/$/, "") === "/account/profile"
    && input.appEnv === "staging" && input.hostname === "pricing-test.shalean.co.za") {
    return "/office/marketing/email/preferences";
  }
  return input.actualRoute;
}
