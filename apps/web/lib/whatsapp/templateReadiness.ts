import "server-only";

import { WHATSAPP_TEMPLATE_CATALOG, resolveConfiguredMetaTemplateName } from "@/lib/whatsapp/whatsappTemplateCatalog";

export type MetaTemplateApprovalStatus = "unknown" | "pending" | "approved" | "rejected";

export type WhatsAppTemplateReadiness = {
  key: string;
  audience: "customer" | "cleaner";
  category: "UTILITY" | "MARKETING";
  language: "en";
  metaTemplateName: string;
  mappingSource: "env" | "default";
  approvalStatus: MetaTemplateApprovalStatus;
  sendReady: boolean;
};

function csvSet(value: string | undefined): Set<string> {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

/**
 * Operator-controlled approval state until Meta template-management API sync is added.
 *
 * These variables contain template names only, never secrets:
 * - WHATSAPP_META_APPROVED_TEMPLATES
 * - WHATSAPP_META_PENDING_TEMPLATES
 * - WHATSAPP_META_REJECTED_TEMPLATES
 *
 * Unknown is intentionally the default. A DB template row being active or a text
 * message succeeding must never be treated as proof of Meta template approval.
 */
export function getWhatsAppTemplateReadiness(): WhatsAppTemplateReadiness[] {
  const approved = csvSet(process.env.WHATSAPP_META_APPROVED_TEMPLATES);
  const pending = csvSet(process.env.WHATSAPP_META_PENDING_TEMPLATES);
  const rejected = csvSet(process.env.WHATSAPP_META_REJECTED_TEMPLATES);

  return WHATSAPP_TEMPLATE_CATALOG.map((spec) => {
    const metaTemplateName = resolveConfiguredMetaTemplateName(spec.key);
    const envName = spec.envVar ? process.env[spec.envVar]?.trim() : "";
    let approvalStatus: MetaTemplateApprovalStatus = "unknown";

    if (approved.has(metaTemplateName) || approved.has(spec.key)) approvalStatus = "approved";
    else if (rejected.has(metaTemplateName) || rejected.has(spec.key)) approvalStatus = "rejected";
    else if (pending.has(metaTemplateName) || pending.has(spec.key)) approvalStatus = "pending";

    return {
      key: spec.key,
      audience: spec.audience,
      category: spec.category,
      language: spec.language,
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
