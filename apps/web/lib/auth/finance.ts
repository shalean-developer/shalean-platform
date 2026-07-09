import "server-only";

import { isAdmin } from "@/lib/auth/admin";

function financeEmailList(): string[] {
  return (process.env.FINANCE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Finance users from env allowlist (admins always have finance access). */
export function isFinanceEmail(email?: string | null): boolean {
  if (!email) return false;
  if (isAdmin(email)) return true;
  return financeEmailList().includes(email.toLowerCase());
}

export function canAccessFinance(email?: string | null, profileFinanceAccess?: boolean | null): boolean {
  if (isFinanceEmail(email)) return true;
  return profileFinanceAccess === true;
}
