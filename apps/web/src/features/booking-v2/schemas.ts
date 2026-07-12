import { z } from "zod";
import { SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2SchedulingConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";
import {
  filterCustomerOnlineBookingTimeSlots,
  isCustomerOnlineBookingTimeSlot,
} from "@/lib/booking-v2/customerBookingTimeSlots";
import {
  CONTACT_PHONE_VALIDATION_MESSAGE,
  isValidContactPhone,
} from "@/lib/booking/contactPhoneValidation";

const contactPhoneField = z
  .string()
  .min(1, "Enter a contact phone number")
  .refine(isValidContactPhone, { message: CONTACT_PHONE_VALIDATION_MESSAGE });

const optionalContactPhoneField = z
  .string()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || isValidContactPhone(v), { message: CONTACT_PHONE_VALIDATION_MESSAGE });

// ─── Step 1: Details ───────────────────────────────────────────────────────────

const equipmentQuoteSchema = z
  .object({
    distance_km: z.number(),
    base_fee: z.number(),
    price_per_km: z.number(),
    distance_charge: z.number(),
    logistics_fee: z.number(),
    base_location: z.string(),
    manual_quote_required: z.boolean(),
    manual_quote_message: z.string(),
    geocode_error: z.boolean().optional(),
    customer_latitude: z.number().optional(),
    customer_longitude: z.number().optional(),
  })
  .passthrough();

const serviceDetailValueSchema = z.union([z.string(), z.number(), z.boolean()]);

function normalizeServiceDetails(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || raw === undefined) continue;
    if (raw === true || raw === false) {
      out[key] = raw ? "yes" : "no";
      continue;
    }
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      out[key] = raw;
    }
  }
  return out;
}

export const step1Schema = z.object({
  serviceDetails: z.preprocess(normalizeServiceDetails, z.record(serviceDetailValueSchema)),
  address: z.string().min(5, "Enter your street address"),
  suburb: z.string().min(2, "Enter your suburb"),
  serviceAreaLocationId: z.string().optional().default(""),
  serviceAreaCityId: z.string().optional().default(""),
  city: z.string().optional().default("Cape Town"),
  postalCode: z.string().optional().default(""),
  accessInstructions: z.string().optional().default(""),
  parkingInstructions: z.string().optional().default(""),
  gateCode: z.string().optional().default(""),
  contactPhone: contactPhoneField,
  selectedExtras: z.array(z.string()).default([]),
  equipmentRequired: z.preprocess(
    (value) => {
      if (value === true || value === "yes") return "yes";
      if (value === false || value === "no") return "no";
      if (value === "" || value == null) return "no";
      return value;
    },
    z.enum(["yes", "no"]),
  ),
  equipmentQuote: equipmentQuoteSchema.nullable().optional().default(null),
});

export type Step1Data = z.infer<typeof step1Schema>;

// ─── Step 2: Schedule ──────────────────────────────────────────────────────────

const step2SchemaBase = z.object({
  bookingType: z.enum(["once_off", "recurring"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date"),
  time: z.string().min(1, "Select a time"),
  alternativeDate: z.string().optional().default(""),
  alternativeTime: z.string().optional().default(""),
  recurringFrequency: z.enum(["weekly", "fortnightly", "monthly", "custom", ""]).default(""),
  recurringDays: z.array(z.string()).default([]),
  recurringStartDate: z.string().optional().default(""),
  recurringEndDate: z.string().optional().default(""),
  cleanerMode: z.enum(["team", "individual_cleaners"]),
  assignedTeamId: z.string().optional().default(""),
  assignedTeamName: z.string().optional().default(""),
  cleanerCount: z.number().min(1).max(3).default(1),
  selectedCleanerIds: z.array(z.string()).optional().default([]),
});

function refineStep2Schedule(
  scheduling?: Partial<BookingV2SchedulingConfig>,
): (data: z.infer<typeof step2SchemaBase>, ctx: z.RefinementCtx) => void {
  return (data, ctx) => {
    if (!isCustomerOnlineBookingTimeSlot(data.time, scheduling)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a valid morning time (8:00 AM – 12:30 PM) or call us for later slots",
        path: ["time"],
      });
    } else if (
      data.date &&
      !filterCustomerOnlineBookingTimeSlots(data.date, { scheduling }).includes(data.time.trim().slice(0, 5))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This time is no longer available for the selected date",
        path: ["time"],
      });
    }
    if (data.bookingType === "recurring" && !data.recurringFrequency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a recurring frequency",
        path: ["recurringFrequency"],
      });
    }
    if (data.cleanerMode === "team" && !data.assignedTeamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select an available team",
        path: ["assignedTeamId"],
      });
    }
  };
}

/** Step 2 schema with optional catalog scheduling (defaults match static morning window). */
export function buildStep2Schema(scheduling?: Partial<BookingV2SchedulingConfig>) {
  return step2SchemaBase.superRefine(refineStep2Schedule(scheduling));
}

export const step2Schema = buildStep2Schema();

export type Step2Data = z.infer<typeof step2Schema>;

// ─── Step 3: Review — no inputs, just display ─────────────────────────────────

// ─── Step 4: Payment — auth sub-form ──────────────────────────────────────────

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signUpSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  phone: optionalContactPhoneField,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignInData = z.infer<typeof signInSchema>;
export type SignUpData = z.infer<typeof signUpSchema>;

// ─── Full booking schema (for confirm API) ────────────────────────────────────

export const bookingV2ConfirmSchema = z.object({
  serviceSlug: z.enum(SERVICE_SLUGS),
  serviceDetails: z.preprocess(normalizeServiceDetails, z.record(serviceDetailValueSchema)),
  address: z.string().min(5),
  suburb: z.string().min(2),
  serviceAreaLocationId: z.string().optional().default(""),
  serviceAreaCityId: z.string().optional().default(""),
  city: z.string().optional().default("Cape Town"),
  postalCode: z.string().optional().default(""),
  accessInstructions: z.string().optional().default(""),
  parkingInstructions: z.string().optional().default(""),
  gateCode: z.string().optional().default(""),
  contactPhone: contactPhoneField,
  selectedExtras: z.array(z.string()).default([]),
  equipmentRequired: z.preprocess(
    (value) => {
      if (value === true || value === "yes") return "yes";
      if (value === false || value === "no") return "no";
      if (value === "" || value == null) return "no";
      return value;
    },
    z.enum(["yes", "no"]),
  ).optional().default("no"),
  equipmentQuote: equipmentQuoteSchema.nullable().optional().default(null),
  bookingType: z.enum(["once_off", "recurring"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(1),
  alternativeDate: z.string().optional().default(""),
  alternativeTime: z.string().optional().default(""),
  recurringFrequency: z.enum(["weekly", "fortnightly", "monthly", "custom", ""]).optional(),
  recurringDays: z.array(z.string()).optional().default([]),
  recurringStartDate: z.string().optional().default(""),
  recurringEndDate: z.string().optional().default(""),
  cleanerMode: z.enum(["team", "individual_cleaners"]),
  assignedTeamId: z.string().optional().default(""),
  assignedTeamName: z.string().optional().default(""),
  cleanerCount: z.number().min(1).max(3).default(1),
  selectedCleanerIds: z.array(z.string()).optional().default([]),
  pricingSummary: z
    .object({
      basePrice: z.number().optional(),
      extrasTotal: z.number().optional(),
      cleanerSurcharge: z.number().optional(),
      total: z.number(),
      estimated_total: z.number().optional(),
      lineItems: z
        .array(
          z.object({
            label: z.string(),
            amountZar: z.number(),
          }),
        )
        .optional(),
    })
    .passthrough(),
  // Clients may send JSON null; treat null like omitted (same footgun as promo/referral codes).
  applyCleaningCreditZar: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.number().min(0).optional(),
  ),
  // Clients may send JSON null when no code is stored; treat null like omitted.
  referralCode: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().optional(),
  ),
  promoCode: z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().optional(),
  ),
});

export type BookingV2ConfirmPayload = z.infer<typeof bookingV2ConfirmSchema>;
