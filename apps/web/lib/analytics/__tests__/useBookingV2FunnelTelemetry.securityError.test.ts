/**
 * Hook-level SecurityError regression for useBookingV2FunnelTelemetry.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FormProvider, useForm } from "react-hook-form";
import { GA4_FUNNEL_EVENTS } from "@/lib/analytics/ga4Events";
import { markRetargetingCandidate } from "@/lib/growth/trackEvent";
import { useBookingV2FunnelTelemetry } from "@/src/features/booking-v2/hooks/useBookingV2FunnelTelemetry";
import type { BookingStep } from "@/src/features/booking-v2/types";

const securityError = new DOMException("Access denied", "SecurityError");

function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw securityError;
    },
    setItem: () => {
      throw securityError;
    },
    removeItem: () => {
      throw securityError;
    },
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
}

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

function installThrowingStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: throwingStorage(),
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: throwingStorage(),
  });
}

function ga4EventNames(gtag: ReturnType<typeof vi.fn>): string[] {
  return gtag.mock.calls.filter((c) => c[0] === "event").map((c) => c[1] as string);
}

describe("useBookingV2FunnelTelemetry SecurityError isolation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let gtag: ReturnType<typeof vi.fn>;
  let unhandled: unknown[];

  beforeEach(() => {
    unhandled = [];
    gtag = vi.fn();
    // React 19 act() requires this flag under jsdom
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    installThrowingStorage();
    (window as unknown as { dataLayer: unknown[] }).dataLayer = [];
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/book/regular-cleaning",
        search: "",
        href: "http://localhost/book/regular-cleaning",
      },
    });
    vi.stubGlobal("navigator", {
      sendBeacon: vi.fn(() => true),
      userAgent: "vitest",
    });

    const onError = (event: ErrorEvent) => {
      unhandled.push(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      unhandled.push(event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    (window as unknown as { __cleanupHandlers?: () => void }).__cleanupHandlers = () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  });

  afterEach(() => {
    (window as unknown as { __cleanupHandlers?: () => void }).__cleanupHandlers?.();
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fires booking_start and service_selected exactly once when localStorage throws SecurityError", async () => {
    let bump: (() => void) | null = null;

    function Outer() {
      const form = useForm({
        defaultValues: {
          suburb: "Sea Point",
          selectedExtras: [],
          selectedCleanerIds: [],
          date: "",
          time: "",
          pricingSummary: { estimated_total: 420 },
        },
      });
      return createElement(
        FormProvider,
        { ...form, children: createElement(Inner) } as unknown as ComponentProps<typeof FormProvider>,
      );
    }

    function Inner() {
      const [tick, setTick] = useState(0);
      bump = () => setTick((t) => t + 1);
      useBookingV2FunnelTelemetry(1 as BookingStep, "regular-cleaning");
      return createElement("div", null, String(tick));
    }

    await act(async () => {
      root.render(createElement(Outer));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Same mount re-render — refs must keep once-only behaviour
    await act(async () => {
      bump?.();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const events = ga4EventNames(gtag);
    expect(events.filter((e) => e === GA4_FUNNEL_EVENTS.BOOKING_START)).toHaveLength(1);
    expect(events.filter((e) => e === GA4_FUNNEL_EVENTS.SERVICE_SELECTED)).toHaveLength(1);
    expect(unhandled).toEqual([]);
  });

  it("markRetargetingCandidate itself swallows SecurityError from getItem/setItem", () => {
    expect(() => {
      window.localStorage.getItem("x");
    }).toThrow(/Access denied|SecurityError/);
    expect(() => {
      window.localStorage.setItem("x", "1");
    }).toThrow(/Access denied|SecurityError/);
    expect(() => markRetargetingCandidate(true)).not.toThrow();
    expect(() => markRetargetingCandidate(false)).not.toThrow();
  });

  it("preserves normal localStorage retargeting behaviour when storage works", () => {
    const store = memoryStorage();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: store,
    });
    markRetargetingCandidate(true);
    expect(store.getItem("shalean_retargeting_pending")).toBe("1");
    markRetargetingCandidate(false);
    expect(store.getItem("shalean_retargeting_pending")).toBeNull();
  });
});
