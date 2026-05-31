import {
  initialBookFlowFormState,
  type BookFlowFormState,
} from "@/src/features/book/bookFlowTypes";

const BOOK_FLOW_STORAGE_KEY = "shalean:book-flow:v1";

export function readBookFlowFormFromStorage(): BookFlowFormState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOK_FLOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookFlowFormState>;
    return { ...initialBookFlowFormState(), ...parsed };
  } catch {
    return null;
  }
}

export function writeBookFlowFormToStorage(form: BookFlowFormState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOOK_FLOW_STORAGE_KEY, JSON.stringify(form));
  } catch {
    /* ignore */
  }
}

export function clearBookFlowFormFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOK_FLOW_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
