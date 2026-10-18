// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), headers: vi.fn() }));
vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", props),
}));
vi.mock("@/lib/cleaner/cleanerAuthenticatedFetch", () => ({
  cleanerAuthenticatedFetch: mocks.fetch,
}));
vi.mock("@/lib/cleaner/cleanerClientHeaders", () => ({
  getCleanerAuthHeaders: mocks.headers,
}));
import {
  EarningsWorkspaceView,
  CleanerEarningsWorkspace,
} from "@/components/cleaner-dashboard/CleanerEarningsWorkspace";
import {
  buildEarningsWorkspace,
  type WorkspaceBatch,
  type WorkspaceBooking,
} from "@/lib/cleaner/buildEarningsWorkspace";

function data() {
  const bookings: WorkspaceBooking[] = Array.from({ length: 21 }, (_, i) => ({
    id: `job-${String(i).padStart(3, "0")}`,
    date: "2026-10-15",
    service: i === 20 ? "Deep cleaning" : "Regular cleaning",
    completed_at: "2026-10-15T12:00:00Z",
    cleaner_id: "own",
    payout_owner_cleaner_id: "own",
    payout_id: null,
    payout_status: "pending",
    display_earnings_cents: 25000,
  }));
  const batches: WorkspaceBatch[] = Array.from({ length: 21 }, (_, i) => ({
    id: `pay-${i}`,
    total_amount_cents: 25000,
    status: "paid",
    payment_status: "success",
    payment_method: "bank_transfer",
    payment_reference: `Receipt-${i}`,
    paid_at: "2026-10-18T12:00:00Z",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
  }));
  return buildEarningsWorkspace({
    cleanerId: "own",
    bookings,
    batches,
    rosterMembers: [],
    teamMembers: [],
    disbursements: [],
    bankReady: false,
    month: "2026-10",
    now: new Date("2026-10-18T12:00:00Z"),
  });
}
let host: HTMLDivElement;
let root: Root;
async function render(element: React.ReactElement) {
  await act(async () => {
    root.render(element);
  });
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(button, `button ${label}`).toBeDefined();
  await act(async () => {
    button!.click();
  });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.headers.mockResolvedValue({ Authorization: "Bearer test-only" });
  mocks.fetch.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("earnings workspace interface", () => {
  it.each([
    ["http", false],
    ["timeout", false],
    ["http", true],
  ] as const)(
    "restores the visible month refresh target after %s navigation failure (explicit prior month: %s)",
    async (failure, explicit) => {
      vi.useFakeTimers();
      const october = data();
      const september = {
        ...october,
        month: "2026-09",
        earnings: [],
        payments: [],
        period: {
          ...october.period,
          earned_cents: 0,
          unbatched_cents: 0,
          completed_visits: 0,
          recorded_payments_cents: 0,
        },
      };
      mocks.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(october), { status: 200 }),
      );
      await render(React.createElement(CleanerEarningsWorkspace));
      const choose = async (value: string) => {
        const select = host.querySelector("select")!;
        await act(async () => {
          select.value = value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
      };
      if (explicit) {
        mocks.fetch.mockResolvedValueOnce(
          new Response(JSON.stringify(september), { status: 200 }),
        );
        await choose("2026-09");
      }
      if (failure === "timeout")
        mocks.fetch.mockImplementationOnce(() => new Promise(() => {}));
      else
        mocks.fetch.mockResolvedValueOnce(new Response("{}", { status: 503 }));
      await choose(explicit ? "2026-10" : "2026-09");
      if (failure === "timeout")
        await act(async () => {
          await vi.advanceTimersByTimeAsync(20_000);
        });
      expect(host.querySelector("select")!.value).toBe(
        explicit ? "2026-09" : "2026-10",
      );
      expect(host.querySelector('[role="alert"]')).not.toBeNull();
      mocks.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(explicit ? september : october), {
          status: 200,
        }),
      );
      await click("Refresh");
      expect(mocks.fetch.mock.calls.at(-1)?.[0]).toBe(
        explicit
          ? "/api/cleaner/earnings/workspace?month=2026-09"
          : "/api/cleaner/earnings/workspace",
      );
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(host.querySelector("select")!.value).toBe(
        explicit ? "2026-09" : "2026-10",
      );
    },
  );
  it("keeps keyboard focus and month selection available during background refresh", async () => {
    const props = {
      data: data(),
      refreshing: false,
      error: null,
      onRefresh: vi.fn(),
      onMonthChange: vi.fn(),
    };
    await render(React.createElement(EarningsWorkspaceView, props));
    const select = host.querySelector("select")!;
    select.focus();
    await render(
      React.createElement(EarningsWorkspaceView, {
        ...props,
        refreshing: true,
      }),
    );
    expect(document.activeElement).toBe(select);
    expect(select.disabled).toBe(false);
    await act(async () => {
      select.value = "2026-09";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onMonthChange).toHaveBeenCalledWith("2026-09");
    const refresh = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Refreshing"),
    )!;
    expect(refresh.disabled).toBe(false);
    expect(refresh.getAttribute("aria-disabled")).toBe("true");
    await act(async () => refresh.click());
    expect(props.onRefresh).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "recovers from a stalled request while retaining any known figures (loaded: %s)",
    async (loaded) => {
      vi.useFakeTimers();
      if (loaded)
        mocks.fetch.mockResolvedValueOnce(
          new Response(JSON.stringify(data()), { status: 200 }),
        );
      let signal!: AbortSignal;
      mocks.fetch.mockImplementationOnce((_url, init) => {
        signal = init.signal;
        return new Promise(() => {});
      });
      await render(React.createElement(CleanerEarningsWorkspace));
      if (loaded) await click("Refresh");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(signal.aborted).toBe(true);
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "took too long",
      );
      if (loaded) expect(host.textContent).toContain("October 2026 earnings");
      else expect(host.textContent).not.toContain("R0");
      mocks.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(data()), { status: 200 }),
      );
      await click(loaded ? "Refresh" : "Try again");
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(host.textContent).toContain("October 2026 earnings");
    },
  );
  it("provides full earnings pages, a separate complete payment total and bank/help actions", async () => {
    await render(
      React.createElement(EarningsWorkspaceView, {
        data: data(),
        refreshing: false,
        error: null,
        onRefresh: vi.fn(),
        onMonthChange: vi.fn(),
      }),
    );
    expect(host.textContent).toContain("October 2026 earnings");
    expect(host.textContent).toContain("Month open");
    expect(host.textContent).toContain("1 Nov 2026");
    expect(host.querySelectorAll('a[href^="/jobs/job/"]')).toHaveLength(10);
    await click("Next");
    expect(host.textContent).toContain("Page 2 of 3");
    await click("Next");
    expect(host.querySelectorAll('a[href^="/jobs/job/"]')).toHaveLength(1);
    expect(host.textContent).toContain("Deep cleaning");
    await click("Payment statements");
    expect(host.textContent).toContain("21 recorded payments");
    expect(host.textContent).toMatch(/5[\s\u00a0,]250/);
    expect(host.querySelectorAll("li")).toHaveLength(10);
    expect(host.querySelector('a[href="/jobs/profile/payout"]')).not.toBeNull();
    expect(host.querySelector('a[href="/jobs/profile/help"]')).not.toBeNull();
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toBe(
      "Payment statements",
    );
  });
  it("keeps known figures and exposes stale status when refresh fails", async () => {
    const payload = data();
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    await render(React.createElement(CleanerEarningsWorkspace));
    expect(host.textContent).toContain("October 2026 earnings");
    mocks.fetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await click("Refresh");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "last successful figures",
    );
    expect(host.textContent).toContain("October 2026 earnings");
  });
  it("rejects partial successful payloads instead of displaying zero balances", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await render(React.createElement(CleanerEarningsWorkspace));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain("R0");
    expect(host.textContent).toContain("Try again");
  });
  it("searches all earning pages and exposes month selection", async () => {
    const changed = vi.fn();
    await render(
      React.createElement(EarningsWorkspaceView, {
        data: data(),
        refreshing: false,
        error: null,
        onRefresh: vi.fn(),
        onMonthChange: changed,
      }),
    );
    const input = host.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "Deep");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll('a[href^="/jobs/job/"]')).toHaveLength(1);
    expect(host.textContent).toContain("Deep cleaning");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "15 Oct 2026");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll('a[href^="/jobs/job/"]')).toHaveLength(10);
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "2026-09";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(changed).toHaveBeenCalledWith("2026-09");
  });
  it("ignores an older aborted response after a newer request succeeds", async () => {
    let resolveOld!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    );
    await render(React.createElement(CleanerEarningsWorkspace));
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(data()), { status: 200 }),
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(host.textContent).toContain("October 2026 earnings");
    await act(async () => {
      resolveOld(new Response("{}", { status: 200 }));
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("October 2026 earnings");
  });
  it("refreshes the server's current period at rollover instead of freezing a client month", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      mocks.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(data()), { status: 200 }),
      );
      await render(React.createElement(CleanerEarningsWorkspace));
      const next = {
        ...data(),
        month: "2026-11",
        today: "2026-11-01",
        as_of: "2026-10-31T22:00:01.000Z",
        months: ["2026-11", "2026-10"],
      };
      mocks.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(next), { status: 200 }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });
      expect(host.textContent).toContain("November 2026 earnings");
      expect(mocks.fetch.mock.calls.at(-1)?.[0]).toBe(
        "/api/cleaner/earnings/workspace",
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("shows unknown amounts, payment review and failure states without a colour-only message", async () => {
    const payload = data();
    payload.period.earned_cents = null;
    payload.period.unavailable_visits = 1;
    payload.period.payment_issue_count = 1;
    payload.period.payment_review_count = 1;
    await render(
      React.createElement(EarningsWorkspaceView, {
        data: payload,
        refreshing: false,
        error: null,
        onRefresh: vi.fn(),
        onMonthChange: vi.fn(),
      }),
    );
    expect(host.textContent).toContain("Unavailable");
    expect(host.textContent).toContain("A payment needs attention");
    await click("Payment statements");
    expect(host.textContent).toContain("excluded from this recorded total");
  });
});
