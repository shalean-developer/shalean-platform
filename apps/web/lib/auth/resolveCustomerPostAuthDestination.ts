import { getResolvedAuthIntent } from "@/lib/auth/authRoleIntent";
import { computePostAuthRedirect } from "@/lib/auth/postAuthRedirect";

type ResolveProfileResponse = {
  ok?: boolean;
  isCleaner?: boolean;
  error?: string;
};

/**
 * Uses a freshly issued access token to detect cleaner linkage, then returns the path to navigate to.
 */
export async function resolveCustomerPostAuthDestination(
  accessToken: string,
  redirect: string,
  intentParam: string | null | undefined,
): Promise<string> {
  const intent = getResolvedAuthIntent(intentParam);
  const res = await fetch("/api/auth/resolve-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });
  const j = (await res.json().catch(() => ({}))) as ResolveProfileResponse;
  const isCleaner = Boolean(res.ok && j.ok && j.isCleaner);
  return computePostAuthRedirect({ intent, isCleaner, redirect });
}
