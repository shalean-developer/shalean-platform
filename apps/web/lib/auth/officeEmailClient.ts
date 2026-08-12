import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type RequestCodeResult = {
  ok: boolean;
  sent?: boolean;
  email?: string;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
  retryAfterSeconds?: number;
  error?: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function requestOfficeEmailCode(): Promise<RequestCodeResult> {
  const response = await fetch("/api/auth/office-email-verification/request", {
    method: "POST",
    headers: await authHeaders(),
    credentials: "same-origin",
  });
  const json = (await response.json().catch(() => ({}))) as RequestCodeResult;
  if (!response.ok) return { ...json, ok: false };
  return { ...json, ok: true };
}

export async function verifyOfficeEmailCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("/api/auth/office-email-verification/verify", {
    method: "POST",
    headers: await authHeaders(),
    credentials: "same-origin",
    body: JSON.stringify({ code: code.replace(/\s+/g, "") }),
  });
  const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return response.ok && json.ok ? { ok: true } : { ok: false, error: json.error ?? "Verification failed." };
}
