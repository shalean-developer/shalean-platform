import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOKING_V2_DRAFT_STORAGE_KEY,
  bookingV2SuccessHref,
  clearBookingV2DraftStorage,
  consumeBookingV2CompletedReset,
} from "@/lib/booking-v2/bookingV2PaymentRedirect";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bookingV2PaymentRedirect", () => {
  it("builds account success URL with encoded reference", () => {
    expect(bookingV2SuccessHref("bv2_abc 123")).toBe(
      "/account/success?reference=bv2_abc%20123",
    );
  });

  it("carries the persisted booking id into payment recovery", () => {
    expect(bookingV2SuccessHref("bps_paid", "123e4567-e89b-42d3-a456-426614174000")).toBe(
      "/account/success?reference=bps_paid&bookingId=123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("clears the completed draft and exposes a one-time form reset", () => {
    const localStorage = memoryStorage();
    const sessionStorage = memoryStorage();
    localStorage.setItem(BOOKING_V2_DRAFT_STORAGE_KEY, "{\"step\":4}");
    vi.stubGlobal("window", { localStorage, sessionStorage });
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", sessionStorage);

    clearBookingV2DraftStorage();

    expect(localStorage.getItem(BOOKING_V2_DRAFT_STORAGE_KEY)).toBeNull();
    expect(consumeBookingV2CompletedReset()).toBe(true);
    expect(consumeBookingV2CompletedReset()).toBe(false);
  });
});
