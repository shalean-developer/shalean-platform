export type AdminToastKind = "success" | "error" | "info";

const EVENT = "admin-toast";

export type AdminToastDetail = { message: string; kind: AdminToastKind };

/** Trailing debounce per kind so bursts coalesce (last message wins). */
const DEBOUNCE_MS = 280;
const pending = new Map<AdminToastKind, { message: string; timer: number }>();

export function emitAdminToast(message: string, kind: AdminToastKind = "info"): void {
  if (typeof window === "undefined") return;
  const cur = pending.get(kind);
  if (cur) window.clearTimeout(cur.timer);
  const timer = window.setTimeout(() => {
    pending.delete(kind);
    window.dispatchEvent(new CustomEvent<AdminToastDetail>(EVENT, { detail: { message, kind } }));
  }, DEBOUNCE_MS) as unknown as number;
  pending.set(kind, { message, timer });
}

export function subscribeAdminToast(handler: (d: AdminToastDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<AdminToastDetail>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
