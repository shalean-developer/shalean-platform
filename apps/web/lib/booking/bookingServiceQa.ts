import { parseBookingServiceId } from "@/components/booking/serviceCategories";

/** Canonical section keys for premium QA MVP (string-based; not normalized). */
export const BOOKING_SERVICE_QA_DEEP_SECTIONS = [
  "kitchen",
  "bathrooms",
  "appliances",
  "floors",
  "bedrooms",
] as const;

export const BOOKING_SERVICE_QA_MOVE_SECTIONS = [
  "kitchen",
  "bathrooms",
  "cabinets",
  "windows",
  "floors",
  "bedrooms",
] as const;

export const BOOKING_SERVICE_QA_SECTION_LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  bathrooms: "Bathrooms",
  appliances: "Appliances",
  floors: "Floors",
  bedrooms: "Bedrooms",
  cabinets: "Cabinets",
  windows: "Windows",
};

export type BookingServiceQaKind = "deep" | "move";

export type BookingServiceQaProfile = {
  kind: BookingServiceQaKind;
  sections: readonly string[];
};

export function resolveBookingServiceQaProfile(
  serviceSlug: string | null | undefined,
  serviceLabel: string | null | undefined,
): BookingServiceQaProfile | null {
  const slug = String(serviceSlug ?? "").trim().toLowerCase();
  let sid = slug ? parseBookingServiceId(slug) : null;
  if (!sid && slug === "deep") sid = "deep";
  if (!sid && slug === "move") sid = "move";

  if (sid !== "deep" && sid !== "move") {
    const label = String(serviceLabel ?? "").trim().toLowerCase();
    if (label.includes("move")) sid = "move";
    else if (label.includes("deep")) sid = "deep";
  }

  if (sid === "deep") {
    return { kind: "deep", sections: BOOKING_SERVICE_QA_DEEP_SECTIONS };
  }
  if (sid === "move") {
    return { kind: "move", sections: BOOKING_SERVICE_QA_MOVE_SECTIONS };
  }
  return null;
}

export function sectionLabelForQaKey(sectionKey: string): string {
  return BOOKING_SERVICE_QA_SECTION_LABELS[sectionKey] ?? sectionKey;
}

/** Cleaner job detail API — nested under `job.service_qa`. */
export type ServiceQaCleanerWire = {
  sections: string[];
  section_labels: Record<string, string>;
  checklist: Array<{
    section_key: string;
    completed: boolean;
    completed_at: string | null;
    notes: string | null;
  }>;
  photos: Array<{
    id: string;
    cleaner_id: string;
    section_key: string;
    section_label: string;
    photo_type: string;
    signed_url: string | null;
    created_at: string;
  }>;
};

/** Admin booking detail API — top-level `service_qa`. */
export type ServiceQaAdminWire = {
  sections: string[];
  section_labels: Record<string, string>;
  checklist: Array<{
    cleaner_id: string;
    cleaner_name: string | null;
    section_key: string;
    section_label: string;
    completed: boolean;
    completed_at: string | null;
    notes: string | null;
  }>;
  photos: Array<{
    id: string;
    cleaner_id: string;
    cleaner_name: string | null;
    section_key: string;
    section_label: string;
    photo_type: string;
    signed_url: string | null;
    created_at: string;
  }>;
};
