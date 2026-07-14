import {
  isNonProductionDeployment,
  outboundTestMessageMarker,
  resolveDeploymentEnvironment,
  type EnvLike,
} from "@/lib/env/deploymentEnvironment";

export type OutboundAllowDecision =
  | { allowed: true; subjectPrefix: string | null }
  | { allowed: false; reason: string };

function parseAllowlist(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    const v = part.trim().toLowerCase();
    if (v) set.add(v);
  }
  return set;
}

/**
 * Non-production outbound email gate.
 *
 * - Production: always allowed (no marker).
 * - Staging/development/preview/local: require `OUTBOUND_EMAIL_ALLOWLIST` (or
 *   `OUTBOUND_MESSAGING_ALLOW_ALL=true` for explicit lab override), and attach
 *   a visible subject marker.
 */
export function decideOutboundEmail(
  to: string | string[],
  env: EnvLike = process.env,
): OutboundAllowDecision {
  const marker = outboundTestMessageMarker(env);
  if (!isNonProductionDeployment(env)) {
    return { allowed: true, subjectPrefix: null };
  }

  if ((env.OUTBOUND_MESSAGING_DISABLED ?? "").trim().toLowerCase() === "true") {
    return { allowed: false, reason: "outbound_messaging_disabled" };
  }

  const recipients = (Array.isArray(to) ? to : [to])
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);

  if ((env.OUTBOUND_MESSAGING_ALLOW_ALL ?? "").trim().toLowerCase() === "true") {
    return { allowed: true, subjectPrefix: marker };
  }

  const allow = parseAllowlist(env.OUTBOUND_EMAIL_ALLOWLIST);
  if (allow.size === 0) {
    return { allowed: false, reason: "outbound_email_allowlist_required" };
  }

  for (const recipient of recipients) {
    if (!allow.has(recipient)) {
      return { allowed: false, reason: `outbound_email_not_allowlisted:${recipient}` };
    }
  }

  return { allowed: true, subjectPrefix: marker };
}

export function applyOutboundSubjectPrefix(subject: string, prefix: string | null | undefined): string {
  const s = subject.trim();
  const p = prefix?.trim();
  if (!p) return s;
  if (s.startsWith(p)) return s;
  return `${p} ${s}`;
}

/** SMS / WhatsApp: non-production requires allowlisted E.164 (or disabled). */
export function decideOutboundPhone(
  phone: string,
  env: EnvLike = process.env,
): OutboundAllowDecision {
  const marker = outboundTestMessageMarker(env);
  if (!isNonProductionDeployment(env)) {
    return { allowed: true, subjectPrefix: null };
  }

  if ((env.OUTBOUND_MESSAGING_DISABLED ?? "").trim().toLowerCase() === "true") {
    return { allowed: false, reason: "outbound_messaging_disabled" };
  }

  if ((env.OUTBOUND_MESSAGING_ALLOW_ALL ?? "").trim().toLowerCase() === "true") {
    return { allowed: true, subjectPrefix: marker };
  }

  const normalized = phone.replace(/[^\d+]/g, "");
  const allow = parseAllowlist(env.OUTBOUND_PHONE_ALLOWLIST);
  if (allow.size === 0) {
    return { allowed: false, reason: "outbound_phone_allowlist_required" };
  }

  const digits = normalized.replace(/\D/g, "");
  const ok = [...allow].some((entry) => {
    const e = entry.replace(/\D/g, "");
    return e && (digits === e || digits.endsWith(e) || e.endsWith(digits));
  });

  if (!ok) {
    return { allowed: false, reason: "outbound_phone_not_allowlisted" };
  }

  return { allowed: true, subjectPrefix: marker };
}

export function applyOutboundBodyMarker(body: string, env: EnvLike = process.env): string {
  const marker = outboundTestMessageMarker(env);
  if (!marker) return body;
  if (body.includes(marker)) return body;
  return `${marker}\n\n${body}`;
}

export function environmentLogTag(env: EnvLike = process.env): string {
  return resolveDeploymentEnvironment(env);
}
