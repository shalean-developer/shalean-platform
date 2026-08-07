import "server-only";

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
// Environment status lists can still override these if Meta later changes state.
const VERIFIED_META_APPROVED_TEMPLATES = new Set(["booking_confirmed", "payment_request"]);

function csvSet(value: string | undefined): Set<string> {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function getWhatsAppTemplateReadiness(): WhatsAppTemplateReadiness[] {
  const approved = csvSet(process.env.WHATSAPP_META_APPROVED_TEMPLATES);
  const pending = csvSet(process.env.WHATSAPP_META_PENDING_TEMPLATES);
  const rejected = csvSet(process.env.WHATSAPP_META_REJECTED_TEMPLATES);

  return WHATSAPP_TEMPLATE_CATALOG.map((spec) => {
    const metaTemplateName = resolveConfiguredMetaTemplateName(spec.key);
    const envName = spec.envVar ? process.env[spec.envVar]?.trim() : "";
    let approvalStatus: MetaTemplateApprovalStatus = "unknown";

    // Explicit environment state wins, so an approval can be revoked without a code deploy.
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
      mappingSource: envName ? "env" : "default",
      approvalStatus,
      sendReady: approvalStatus === "approved",
    };
  });
}

export function getWhatsAppTemplateReadinessByKey(key: string): WhatsAppTemplateReadiness | null {
  return getWhatsAppTemplateReadiness().find((item) => item.key === key) ?? null;
}
