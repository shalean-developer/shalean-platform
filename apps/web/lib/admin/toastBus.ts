export type AdminToastKind = "success" | "error" | "info";

const EVENT = "admin-toast";

export type AdminToastDetail = { message: string; kind: AdminToastKind };

export function emitAdminToast(message: string, kind: AdminToastKind = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AdminToastDetail>(EVENT, { detail: { message, kind } }));
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
