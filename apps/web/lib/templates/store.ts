import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { TemplateChannel, TemplateRow } from "@/lib/templates/types";

const templateCache = new Map<string, TemplateRow>();

function cacheKey(key: string, channel: TemplateChannel): string {
  return `${key}:${channel}`;
}

export function invalidateTemplateCache(key?: string, channel?: TemplateChannel): void {
  if (key && channel) {
    templateCache.delete(cacheKey(key, channel));
    return;
  }
  templateCache.clear();
}

export async function getTemplate(key: string, channel: TemplateChannel): Promise<TemplateRow | null> {
  const ck = cacheKey(key, channel);
  if (templateCache.has(ck)) {
    return templateCache.get(ck) ?? null;
  }

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("templates")
    .select("id, key, channel, subject, content, variables, is_active, created_at, updated_at")
    .eq("key", key)
    .eq("channel", channel)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data || typeof data !== "object") return null;

  const row = data as TemplateRow;
  if (!row.content || typeof row.content !== "string") return null;

  templateCache.set(ck, row);
  return row;
}
