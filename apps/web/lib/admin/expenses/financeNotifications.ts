import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function createFinanceNotification(
  admin: SupabaseClient,
  opts: {
    userId: string;
    type: string;
    title: string;
    body: string;
    link?: string;
    entityType?: string;
    entityId?: string;
  },
) {
  const { error } = await admin.from("finance_notifications").insert({
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link ?? null,
    entity_type: opts.entityType ?? null,
    entity_id: opts.entityId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function notifyFinanceUsers(
  admin: SupabaseClient,
  opts: Omit<Parameters<typeof createFinanceNotification>[1], "userId">,
) {
  const { data: users } = await admin
    .from("user_profiles")
    .select("id")
    .or("finance_access.eq.true,finance_manager_access.eq.true,finance_owner_access.eq.true");

  for (const u of users ?? []) {
    await createFinanceNotification(admin, { ...opts, userId: u.id });
  }
}
