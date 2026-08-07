import "server-only";

import { ONCE_OFF_RECURRING_TEMPLATE } from "@/lib/growth/onceOffRecurringTemplate";
import { WHATSAPP_TEMPLATE_CATALOG, resolveConfiguredMetaTemplateName } from "@/lib/whatsapp/whatsappTemplateCatalog";

export type MetaTemplateApprovalStatus = "unknown" | "pending" | "approved" | "rejected";

export type WhatsAppTemplateReadiness = {
  key: string;
  audience: "customer" | "cleaner";
  category: "UTILITY" | "MARKETING";
  language: "en";
  variables: readonly string[];
  body: string;
  metaTemplateName: string;
  mappingSource: "env" | "default";
  approvalStatus: MetaTemplateApprovalStatus;
  sendReady: boolean;
};

// Verified manually in WhatsApp Manager on 2026-08-07.
// booking_assigned and booking_cancelled remain in Meta review and are intentionally
// excluded until their status changes to approved. Environment status lists can
// still override these values if Meta later changes a template state.
const VERIFIED_META_APPROVED_TEMPLATES = new Set([
  "booking_confirmed",
  "payment_request",
  "payment_confirmed",
  "booking_reminder_24h",
  "customer_booking_assigned",
  "booking_rescheduled",
  "job_completed",
  "review_prompt",
  "booking_offer",
  "offer_ack",
  "reminder",
  "escalation",
  "cleaner_welcome",
  "cleaner_approved",
  "cleaner_booking_changed",
  "cleaner_booking_cancelled",
  "once_off_to_recurring_offer",
]);

function csvSet(value: string | undefined): Set<string> {
  return new Set(String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

export function getWhatsAppTemplateReadiness(): WhatsAppTemplateReadiness[] {
  const approved = csvSet(process.env.WHATSAPP_META_APPROVED_TEMPLATES);
  const pending = csvSet(process.env.WHATSAPP_META_PENDING_TEMPLATES);
  const rejected = csvSet(process.env.WHATSAPP_META_REJECTED_TEMPLATES);
  const specs = [...WHATSAPP_TEMPLATE_CATALOG, ONCE_OFF_RECURRING_TEMPLATE];

  return specs.map((spec) => {
    const configured = spec.envVar ? process.env[spec.envVar]?.trim() : "";
    const metaTemplateName = configured || (spec.key === ONCE_OFF_RECURRING_TEMPLATE.key ? spec.key : resolveConfiguredMetaTemplateName(spec.key));
    let approvalStatus: MetaTemplateApprovalStatus = "unknown";

    if (rejected.has(metaTemplateName) || rejected.has(spec.key)) approvalStatus = "rejected";
    else if (pending.has(metaTemplateName) || pending.has(spec.key)) approvalStatus = "pending";
    else if (approved.has(metaTemplateName) || approved.has(spec.key) || VERIFIED_META_APPROVED_TEMPLATES.has(metaTemplateName) || VERIFIED_META_APPROVED_TEMPLATES.has(spec.key)) approvalStatus = "approved";

    return {
      key: spec.key,
      audience: spec.audience,
      category: spec.category,
      language: spec.language,
      variables: spec.variables,
      body: spec.body,
      metaTemplateName,
      mappingSource: configured ? "env" : "default",
      approvalStatus,
      sendReady: approvalStatus === "approved",
    };
  });
}

export function getWhatsAppTemplateReadinessByKey(key: string): WhatsAppTemplateReadiness | null {
  return getWhatsAppTemplateReadiness().find((item) => item.key === key) ?? null;
}
