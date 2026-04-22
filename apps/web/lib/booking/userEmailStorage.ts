export const USER_EMAIL_KEY = "user_email";

export function readUserEmailFromStorage(): string {
  if (typeof window === "undefined") return "";
  try {
    const v = localStorage.getItem(USER_EMAIL_KEY);
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

export function writeUserEmailToStorage(email: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = email.trim();
    if (t) localStorage.setItem(USER_EMAIL_KEY, t);
  } catch {
    /* ignore */
  }
}
