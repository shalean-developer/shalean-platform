export const SALES_CRM_STAGES = ["lead", "qualified", "quote", "follow_up", "won", "lost"] as const;
export const SALES_CRM_ACTIVITY_TYPES = ["note", "call", "email", "whatsapp", "follow_up"] as const;

export type SalesCrmStage = (typeof SALES_CRM_STAGES)[number];
export type SalesCrmActivityType = (typeof SALES_CRM_ACTIVITY_TYPES)[number];

export function isSalesCrmStage(value: unknown): value is SalesCrmStage {
  return typeof value === "string" && (SALES_CRM_STAGES as readonly string[]).includes(value);
}

export function isSalesCrmActivityType(value: unknown): value is SalesCrmActivityType {
  return typeof value === "string" && (SALES_CRM_ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function normalizedCrmText(value: unknown, max = 4000): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

export function parseOptionalCrmDate(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function opportunityRootId(document: { id: string; converted_from_id?: string | null }): string {
  return document.converted_from_id?.trim() || document.id;
}
