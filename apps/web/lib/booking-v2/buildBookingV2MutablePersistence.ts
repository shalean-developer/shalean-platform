type RowInput = {
  customerPhone: string | null;
  canonicalServiceSlug: string;
  serviceSlug: string;
  serviceDetails: Record<string, unknown>;
  selectedExtraIds: string[];
  date: string;
  time: string;
  alternativeDate?: string | null;
  alternativeTime?: string | null;
  bookingType: string;
  recurringFrequency?: string | null;
  recurringDays?: string[] | null;
  recurringStartDate?: string | null;
  recurringEndDate?: string | null;
  cleanerMode: string;
  assignedTeamId?: string | null;
  cleanerCount: number;
  preferredCleanerIds: string[];
  preferredCleanerFields: Record<string, unknown>;
  persistPricing: Record<string, unknown>;
  pricingVersionId: string;
  equipmentPersist: Record<string, unknown>;
  locationFields: Record<string, unknown>;
  priceSnapshot: Record<string, unknown>;
  fulfillmentMode: string;
  fulfillmentReason: string;
  address: string;
  suburb: string;
  postalCode?: string | null;
  accessInstructions?: string | null;
  parkingInstructions?: string | null;
  gateCode?: string | null;
  bookingSnapshot: Record<string, unknown>;
};

export function buildBookingV2MutablePersistence(input: RowInput): Record<string, unknown> {
  const individual = input.cleanerMode === "individual_cleaners";
  return {
    customer_phone: input.customerPhone,
    service: input.serviceSlug,
    service_slug: input.canonicalServiceSlug,
    dispatch_status: input.fulfillmentMode === "ops_assignment" ? "unassigned" : "searching",
    fulfillment_mode: input.fulfillmentMode,
    fulfillment_reason: input.fulfillmentReason,
    location: input.address,
    suburb: input.suburb,
    postal_code: input.postalCode || null,
    ...input.locationFields,
    access_instructions: input.accessInstructions || null,
    parking_instructions: input.parkingInstructions || null,
    gate_code: input.gateCode || null,
    date: input.date,
    time: input.time,
    alt_date: input.alternativeDate || null,
    alt_time: input.alternativeTime || null,
    booking_type: input.bookingType,
    recurring_frequency: input.recurringFrequency || null,
    recurring_days: input.recurringDays?.length ? input.recurringDays : null,
    recurring_start_date: input.recurringStartDate || null,
    recurring_end_date: input.recurringEndDate || null,
    cleaner_mode: input.cleanerMode,
    is_team_job: false,
    team_id: null,
    assigned_team_id: input.cleanerMode === "team" ? input.assignedTeamId : null,
    payout_owner_cleaner_id: null,
    cleaner_count: individual ? Math.max(input.cleanerCount, input.preferredCleanerIds.length) || input.cleanerCount : null,
    ...(individual ? input.preferredCleanerFields : {}),
    service_details: input.serviceDetails,
    selected_extras: input.selectedExtraIds,
    ...input.persistPricing,
    pricing_version_id: input.pricingVersionId,
    ...input.equipmentPersist,
    price_snapshot: input.priceSnapshot,
    booking_snapshot: input.bookingSnapshot,
  };
}
