import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Maps free-text booking/cleaner labels to `locations.id` via kebab-case slug
 * (same rule as SQL: `lower(regexp_replace(trim(label), '\s+', '-', 'g'))`).
 */
export function locationLabelToSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/**
 * Resolves a suburb/area label to `public.locations.id` when a row exists.
 */
export async function resolveLocationIdFromLabel(
  supabase: SupabaseClient,
  label: string | null | undefined,
): Promise<string | null> {
  const t = typeof label === "string" ? label.trim() : "";
  if (!t) return null;
  const slug = locationLabelToSlug(t);
  if (!slug) return null;

  const { data, error } = await supabase.from("locations").select("id").eq("slug", slug).maybeSingle();

  if (error) {
    return null;
  }
  const id = data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : null;
  return id || null;
}
