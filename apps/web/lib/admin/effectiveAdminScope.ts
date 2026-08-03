import type { SupabaseClient } from "@supabase/supabase-js";

export type EffectiveAdminScope = {
  userId: string;
  isOwner: boolean;
  roles: string[];
  permissions: string[];
  branches: string[];
  teams: string[];
  resolvedAt: string;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getEffectiveAdminScope(
  adminClient: SupabaseClient<any, any, any>,
  userId: string,
): Promise<{ scope: EffectiveAdminScope | null; error: unknown | null }> {
  const { data, error } = await adminClient.rpc("admin_effective_scope_snapshot", {
    p_target_user_id: userId,
  });

  if (error) return { scope: null, error };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { scope: null, error: new Error("Invalid admin scope snapshot.") };
  }

  const raw = data as Record<string, unknown>;
  return {
    scope: {
      userId: typeof raw.userId === "string" ? raw.userId : userId,
      isOwner: raw.isOwner === true,
      roles: stringArray(raw.roles),
      permissions: stringArray(raw.permissions),
      branches: stringArray(raw.branches),
      teams: stringArray(raw.teams),
      resolvedAt: typeof raw.resolvedAt === "string" ? raw.resolvedAt : new Date().toISOString(),
    },
    error: null,
  };
}
