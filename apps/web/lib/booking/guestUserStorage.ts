export const GUEST_USER_KEY = "guest_user";

export type GuestUserPayload = {
  name: string;
  email: string;
  phone: string;
};

export function readGuestUserFromStorage(): GuestUserPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GUEST_USER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.email !== "string" || typeof o.phone !== "string") return null;
    return { name: o.name, email: o.email, phone: o.phone };
  } catch {
    return null;
  }
}

export function writeGuestUserToStorage(payload: GuestUserPayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      GUEST_USER_KEY,
      JSON.stringify({
        name: payload.name.trim(),
        email: payload.email.trim(),
        phone: payload.phone.trim(),
      }),
    );
  } catch {
    /* ignore */
  }
}
