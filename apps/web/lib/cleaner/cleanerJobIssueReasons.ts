import { CUSTOMER_SUPPORT_TELEPHONE_E164, CUSTOMER_SUPPORT_WHATSAPP_URL } from "@/lib/site/customerSupport";

export const CLEANER_JOB_ISSUE_REASON_VERSION = "v1" as const;

export type CleanerJobIssueWhatsappSnapshot = {
  channel: "whatsapp";
  prefill_text: string;
  /** Canonical ops E.164 (same line cleaners use via wa.me). */
  target: string;
  wa_url: string;
};

export const CLEANER_JOB_ISSUE_REASONS = [
  { key: "gate_access", label: "Can't get in — gate, door, or access code" },
  { key: "customer_unreachable", label: "Customer not answering (calls / messages)" },
  { key: "safety_animal", label: "Safety concern — aggressive pet or unsafe property" },
  { key: "wrong_address", label: "Wrong address or can't find the property" },
  { key: "scope_mismatch", label: "Job details don't match what was booked" },
  { key: "running_late", label: "Running late — need ops to notify customer" },
  { key: "other", label: "Something else" },
] as const;

export type CleanerJobIssueReasonKey = (typeof CLEANER_JOB_ISSUE_REASONS)[number]["key"];

const KEY_SET = new Set<string>(CLEANER_JOB_ISSUE_REASONS.map((r) => r.key));

export function isValidCleanerJobIssueReasonKey(k: string): k is CleanerJobIssueReasonKey {
  return KEY_SET.has(k);
}

export function labelForCleanerJobIssueReasonKey(key: CleanerJobIssueReasonKey): string {
  const row = CLEANER_JOB_ISSUE_REASONS.find((r) => r.key === key);
  return row?.label ?? key;
}

/** Admin / history: human label; appends taxonomy version when it is not the current default. */
export function issueReportReasonDisplay(reasonKey: string, reasonVersion: string | null | undefined): string {
  const ver = (reasonVersion ?? CLEANER_JOB_ISSUE_REASON_VERSION).trim() || CLEANER_JOB_ISSUE_REASON_VERSION;
  const k = reasonKey.trim();
  const label = isValidCleanerJobIssueReasonKey(k) ? labelForCleanerJobIssueReasonKey(k) : k || "—";
  if (ver === CLEANER_JOB_ISSUE_REASON_VERSION || ver === "v1") return label;
  return `${label} · taxonomy ${ver}`;
}

export function buildCleanerJobIssuePrefillText(params: {
  bookingId: string;
  reasonLabel: string;
  detail?: string | null;
  location?: string | null;
}): string {
  const lines = [
    "Hi — I'm on a Shalean job and need help.",
    `Booking: ${params.bookingId}`,
    `Issue: ${params.reasonLabel}`,
  ];
  if (params.detail?.trim()) lines.push(`Details: ${params.detail.trim().slice(0, 400)}`);
  if (params.location?.trim()) lines.push(`Address: ${params.location.trim().slice(0, 200)}`);
  return lines.join("\n");
}

export function buildCleanerJobIssueWhatsappSnapshot(params: {
  bookingId: string;
  reasonLabel: string;
  detail?: string | null;
  location?: string | null;
}): CleanerJobIssueWhatsappSnapshot {
  const prefill_text = buildCleanerJobIssuePrefillText(params);
  const wa_url = buildCleanerJobIssueWhatsAppUrl(params);
  return {
    channel: "whatsapp",
    prefill_text,
    target: CUSTOMER_SUPPORT_TELEPHONE_E164,
    wa_url,
  };
}

export function buildCleanerJobIssueWhatsAppUrl(params: {
  bookingId: string;
  reasonLabel: string;
  detail?: string | null;
  location?: string | null;
}): string {
  const text = buildCleanerJobIssuePrefillText(params);
  try {
    const u = new URL(CUSTOMER_SUPPORT_WHATSAPP_URL);
    u.searchParams.set("text", text);
    return u.toString();
  } catch {
    return `https://wa.me/27215550123?text=${encodeURIComponent(text)}`;
  }
}
