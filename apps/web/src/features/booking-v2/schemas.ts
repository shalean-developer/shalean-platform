import { z } from "zod";
import { SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";
import {
  filterCustomerOnlineBookingTimeSlots,
  isCustomerOnlineBookingTimeSlot,
} from "@/lib/booking-v2/customerBookingTimeSlots";

// ─── Step 1: Details ───────────────────────────────────────────────────────────

export const step1Schema = z.object({
  serviceDetails: z.record(z.union([z.string(), z.number(), z.boolean()])),
  address: z.string().min(5, "Enter your street address"),
  suburb: z.string().min(2, "Enter your suburb"),
  city: z.string().optional().default("Cape Town"),
  postalCode: z.string().optional().default(""),
  accessInstructions: z.string().optional().default(""),
  parkingInstructions: z.string().optional().default(""),
  gateCode: z.string().optional().default(""),
  contactPhone: z
    .string()
    .regex(/^0\d{9}$/, "Enter a valid 10-digit SA phone number (e.g. 0821234567)"),
  selectedExtras: z.array(z.string()).default([]),
});

export type Step1Data = z.infer<typeof step1Schema>;

// ─── Step 2: Schedule ──────────────────────────────────────────────────────────

export const step2Schema = z
  .object({
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
    cleanerCount: z.number().min(1).max(3).default(1),
    selectedCleanerIds: z.array(z.string()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (!isCustomerOnlineBookingTimeSlot(data.time)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a valid morning time (8:00 AM – 12:30 PM) or call us for later slots",
        path: ["time"],
      });
    } else if (data.date && !filterCustomerOnlineBookingTimeSlots(data.date).includes(data.time.trim().slice(0, 5))) {
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
  });

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
  phone: z
    .string()
    .regex(/^0\d{9}$/, "Enter a valid 10-digit SA phone number (e.g. 0821234567)")
    .optional()
    .or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignInData = z.infer<typeof signInSchema>;
export type SignUpData = z.infer<typeof signUpSchema>;

// ─── Full booking schema (for confirm API) ────────────────────────────────────

export const bookingV2ConfirmSchema = z.object({
  serviceSlug: z.enum(SERVICE_SLUGS),
  serviceDetails: z.record(z.union([z.string(), z.number(), z.boolean()])),
  address: z.string().min(5),
  suburb: z.string().min(2),
  city: z.string().optional().default("Cape Town"),
  postalCode: z.string().optional().default(""),
  accessInstructions: z.string().optional().default(""),
  parkingInstructions: z.string().optional().default(""),
  gateCode: z.string().optional().default(""),
  contactPhone: z
    .string()
    .regex(/^0\d{9}$/, "Enter a valid 10-digit SA phone number (e.g. 0821234567)"),
  selectedExtras: z.array(z.string()).default([]),
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
});

export type BookingV2ConfirmPayload = z.infer<typeof bookingV2ConfirmSchema>;
