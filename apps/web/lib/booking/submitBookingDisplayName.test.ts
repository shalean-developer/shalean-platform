import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitBooking } from "@/lib/booking/submitBooking";
import { BOOKING_CLEANER_KEY } from "@/lib/booking/cleanerSelection";

const PRINCESS_ID = "11111111-1111-4111-8111-111111111111";

const basePayload = {
  service: "standard",
  bedrooms: 2,
  bathrooms: 1,
  extraRooms: 0,
  extras: [] as string[],
  date: "2026-06-01",
  time: "09:00",
  location: "1 Long St, Cape Town",
  customerName: "Customer One",
  customerEmail: "c1@example.com",
  customerPhone: "0820000001",
};

/** Lightweight localStorage shim so the node-env test can exercise window-bound helpers. */
function installWindowShim(): { reset: () => void } {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(i: number) {
      return [...store.keys()][i] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  const win = {
    localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = win;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = localStorage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Event = class Event {};
  return {
    reset: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).localStorage;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).Event;
    },
  };
}

let shim: { reset: () => void };

beforeEach(() => {
  shim = installWindowShim();
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ success: true, bookingId: "ba000000-0000-4000-8000-00000000beef" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  shim.reset();
  vi.restoreAllMocks();
});

function readStoredCleanerName(): string | null {
  const raw = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(BOOKING_CLEANER_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { name?: string };
  return parsed?.name ?? null;
}

describe("submitBooking — selected cleaner display name persistence", () => {
  it("writes the customer's actual cleaner pick to BOOKING_CLEANER_KEY (used by useSelectedCleaner)", async () => {
    const result = await submitBooking({
      ...basePayload,
      cleanerId: PRINCESS_ID,
      cleanerDisplayName: "Princess Saidi",
    });
    expect(result.success).toBe(true);
    expect(readStoredCleanerName()).toBe("Princess Saidi");
  });

  it("falls back to a stable label when display name is missing — never overwrites with auto-assign copy", async () => {
    const result = await submitBooking({
      ...basePayload,
      cleanerId: PRINCESS_ID,
      cleanerDisplayName: null,
    });
    expect(result.success).toBe(true);
    expect(readStoredCleanerName()).toBe("Selected cleaner");
  });

  it("clears storage when the customer chose auto-assign (no cleaner id)", async () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      BOOKING_CLEANER_KEY,
      JSON.stringify({ id: PRINCESS_ID, name: "Princess Saidi" }),
    );
    const result = await submitBooking({
      ...basePayload,
      cleanerId: null,
    });
    expect(result.success).toBe(true);
    expect((globalThis as unknown as { localStorage: Storage }).localStorage.getItem(BOOKING_CLEANER_KEY)).toBeNull();
  });
});
