import "server-only";

import { createHash } from "node:crypto";
import type { SalesDocumentQuoteRequestSelectedItem } from "@/lib/salesDocument/types";

const DEDUPE_WINDOW_MS = 10 * 60_000;

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildCustomerQuoteRequestFingerprint(input: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  extraRooms: number | null;
  suburb: string;
  preferredDate: string | null;
  message: string | null;
  selectedItems: SalesDocumentQuoteRequestSelectedItem[];
  nowMs?: number;
}): string {
  const bucket = Math.floor((input.nowMs ?? Date.now()) / DEDUPE_WINDOW_MS);
  const selectedItems = [...input.selectedItems]
    .map((item) => ({
      kind: item.kind,
      slug: norm(item.slug),
      quantity: Math.max(1, Math.round(Number(item.quantity ?? 1))),
    }))
    .sort((a, b) => `${a.kind}:${a.slug}`.localeCompare(`${b.kind}:${b.slug}`));

  const payload = {
    v: 1,
    bucket,
    customerName: norm(input.customerName),
    customerEmail: norm(input.customerEmail),
    customerPhone: norm(input.customerPhone).replace(/[^0-9+]/g, ""),
    propertyType: norm(input.propertyType),
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    extraRooms: input.extraRooms,
    suburb: norm(input.suburb),
    preferredDate: input.preferredDate ?? null,
    message: norm(input.message),
    selectedItems,
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
