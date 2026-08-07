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

const VERIFIED_META_APPROVED_TEMPLATES = new Set(["booking_confirmed", "payment_request"]);

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
