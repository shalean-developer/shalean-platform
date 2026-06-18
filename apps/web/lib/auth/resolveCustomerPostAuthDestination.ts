import { resolvePostAuthDestination } from "@/lib/auth/resolvePostAuthDestination";

/**
 * @deprecated Use {@link resolvePostAuthDestination} — resolves `user_profiles.role` for routing.
 */
export async function resolveCustomerPostAuthDestination(
  accessToken: string,
  redirect: string,
  _intentParam?: string | null,
): Promise<string> {
  const result = await resolvePostAuthDestination(accessToken, redirect);
  if (result.kind === "redirect") return result.path;
  if (result.kind === "timeout") throw new Error("ROLE_FETCH_TIMEOUT");
  throw new Error(result.message);
}
