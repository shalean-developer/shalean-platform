import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT,
  CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT,
  compareCustomerBookingRowsDesc,
  decodeCustomerBookingsCursor,
  encodeCustomerBookingsCursor,
  loadCustomerBookingPageForUser,
  normalizeCustomerBookingsPageLimit,
} from "@/lib/customer/customerBookingPageForUser";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("SR-10B customer booking pagination", () => {
  it("bounds customer page sizes", () => {
    expect(CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT).toBe(25);
    expect(CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT).toBe(50);
    expect(normalizeCustomerBookingsPageLimit(undefined)).toBe(25);
    expect(normalizeCustomerBookingsPageLimit(0)).toBe(1);
    expect(normalizeCustomerBookingsPageLimit(999)).toBe(50);
  });

  it("round-trips the stable created_at + id cursor", () => {
    const cursor = encodeCustomerBookingsCursor({
      id: "00000000-0000-4000-8000-000000000123",
      created_at: "2026-08-29T08:00:00.000Z",
    });
    expect(decodeCustomerBookingsCursor(cursor)).toEqual({
      id: "00000000-0000-4000-8000-000000000123",
      createdAt: "2026-08-29T08:00:00.000Z",
    });
    expect(decodeCustomerBookingsCursor("not-a-valid-cursor")).toBeNull();
    const invalidIdCursor = Buffer.from(JSON.stringify({
      id: "not-a-uuid),status.eq.completed",
      createdAt: "2026-08-29T08:00:00.000Z",
    })).toString("base64url");
    expect(decodeCustomerBookingsCursor(invalidIdCursor)).toBeNull();
  });

  it("preserves and orders PostgreSQL microsecond cursor boundaries", () => {
    const createdAt = "2026-08-29T08:00:00.123456+00:00";
    const cursor = encodeCustomerBookingsCursor({
      id: "00000000-0000-4000-8000-000000000123",
      created_at: createdAt,
    });
    expect(decodeCustomerBookingsCursor(cursor)?.createdAt).toBe(createdAt);

    const newer = { id: "00000000-0000-4000-8000-000000000124", created_at: createdAt };
    const older = {
      id: "00000000-0000-4000-8000-000000000125",
      created_at: "2026-08-29T08:00:00.123455+00:00",
    };
    expect([older, newer].sort(compareCustomerBookingRowsDesc)).toEqual([newer, older]);
  });

  it("rejects calendar-invalid microsecond cursors with HTTP 400 before querying", async () => {
    const cursor = Buffer.from(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000123",
      createdAt: "2026-02-31T08:00:00.123456+00:00",
    })).toString("base64url");

    expect(decodeCustomerBookingsCursor(cursor)).toBeNull();
    await expect(loadCustomerBookingPageForUser({} as never, "customer-id", { cursor })).resolves.toEqual({
      ok: false,
      error: "Invalid bookings cursor.",
      status: 400,
    });
  });

  it("rejects PostgreSQL-invalid year-zero cursors with HTTP 400 before querying", async () => {
    const cursor = Buffer.from(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000123",
      createdAt: "0000-01-01T00:00:00.123456+00:00",
    })).toString("base64url");

    expect(decodeCustomerBookingsCursor(cursor)).toBeNull();
    await expect(loadCustomerBookingPageForUser({} as never, "customer-id", { cursor })).resolves.toEqual({
      ok: false,
      error: "Invalid bookings cursor.",
      status: 400,
    });
  });

  it("rejects timezone offsets outside PostgreSQL's supported range with HTTP 400", async () => {
    const invalidCursor = Buffer.from(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000123",
      createdAt: "2026-08-29T08:00:00.123456+16:00",
    })).toString("base64url");

    expect(decodeCustomerBookingsCursor(invalidCursor)).toBeNull();
    await expect(loadCustomerBookingPageForUser({} as never, "customer-id", { cursor: invalidCursor })).resolves.toEqual({
      ok: false,
      error: "Invalid bookings cursor.",
      status: 400,
    });

    const boundary = "2026-08-29T08:00:00.123456+15:59";
    const validCursor = encodeCustomerBookingsCursor({
      id: "00000000-0000-4000-8000-000000000123",
      created_at: boundary,
    });
    expect(decodeCustomerBookingsCursor(validCursor)?.createdAt).toBe(boundary);
  });

  it("uses a bounded cursor query and keeps pending-payment rows visible", () => {
    const loader = read("apps/web/lib/customer/customerBookingPageForUser.ts");
    expect(loader).toContain("const fetchLimit = limit + 1");
    expect(loader).toContain('.order("created_at", { ascending: false })');
    expect(loader).toContain('.order("id", { ascending: false })');
    expect(loader).toContain('.neq("status", "payment_expired")');
    expect(loader).not.toContain('.neq("status", "pending_payment")');
  });

  it("publishes pageInfo from the API and consumes it in the account hook", () => {
    const route = read("apps/web/app/api/customer/bookings/route.ts");
    const hook = read("apps/web/hooks/useBookings.ts");
    const page = read("apps/web/app/(ui-redesign)/account/bookings/page.tsx");

    expect(route).toContain("pageInfo: out.pageInfo");
    expect(hook).toContain("cursor=${encodeURIComponent(nextCursor)}");
    expect(hook).toContain("mergeBookingRows(current, incoming)");
    expect(page).toContain("Load older bookings");
    expect(page).toContain("void loadMore()");
  });

  it("preserves complete history for deployed no-parameter clients with bounded internal pages", () => {
    const route = read("apps/web/app/api/customer/bookings/route.ts");
    expect(route).toContain("const legacyNoParameterRequest =");
    expect(route).toContain("url.searchParams.size === 0");
    expect(route).toContain("loadLegacyCompleteBookingHistory");
    expect(route).toContain("limit: CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT");
    expect(route).toContain("seenCursors.has(nextCursor)");
    expect(route).toContain("cursor = nextCursor");
  });

  it("keeps complete-history consumers explicit while account bookings stays paged", () => {
    const hook = read("apps/web/hooks/useBookings.ts");
    const page = read("apps/web/app/(ui-redesign)/account/bookings/page.tsx");
    expect(hook).toContain('mode = options?.mode === "paged" ? "paged" : "complete"');
    expect(hook).toContain("async function fetchBookingPages(options:");
    expect(hook).toContain("limit: String(CUSTOMER_BOOKINGS_PAGE_LIMIT)");
    expect(hook).toContain('query.set("cursor", cursor)');
    expect(hook).toContain("seenCursors.has(nextCursor)");
    expect(page).toContain('useBookings({ mode: "paged", includeUpcoming: true, includeCompleteReviewHistory: true })');
  });

  it("computes pending-review prompts from independently complete bounded pages", () => {
    const hook = read("apps/web/hooks/useBookings.ts");
    const page = read("apps/web/app/(ui-redesign)/account/bookings/page.tsx");
    expect(page).toContain("includeCompleteReviewHistory: true");
    expect(page).toContain("reviewBookings.find");
    expect(page).toContain("reviewBookings.filter");
    expect(hook).toContain('const reviewHistory = await fetchBookingPages({ view: "review_eligibility" })');
    expect(hook).toContain("setReviewRows(reviewHistory.rows)");
    expect(hook).toContain("limit: String(CUSTOMER_BOOKINGS_PAGE_LIMIT)");
    expect(hook).toContain("seenCursors.has(nextCursor)");
  });

  it("keeps reviewed booking IDs complete and visible pages independent of review-history failures", () => {
    const hook = read("apps/web/hooks/useBookings.ts");
    const reviewsHook = read("apps/web/hooks/useReviews.ts");
    const reviewsRoute = read("apps/web/app/api/me/reviews/route.ts");
    const reviewLoader = read("apps/web/lib/customer/loadCustomerReviewsForUser.ts");
    expect(reviewLoader).toContain(".limit(100)");
    expect(reviewsHook).toContain("REVIEW_ELIGIBILITY_BATCH_SIZE = 100");
    expect(reviewsHook).toContain("normalizedIds.slice(offset, offset + REVIEW_ELIGIBILITY_BATCH_SIZE)");
    expect(reviewsHook).toContain('method: "POST"');
    expect(reviewsHook).toContain("setCompletedKey(requestKey)");
    expect(reviewsRoute).toContain("REVIEW_ID_LOOKUP_MAX = 100");
    expect(reviewsRoute).toContain('.in("booking_id", bookingIds)');
    expect(reviewsRoute).toContain('.eq("user_id", auth.session.userId)');
    expect(reviewsRoute).toContain(".limit(REVIEW_ID_LOOKUP_MAX)");
    expect(reviewsRoute).toContain("bookingIds.length > REVIEW_ID_LOOKUP_MAX");

    const visibleCommit = hook.indexOf("setRows(nextRows)");
    const reviewTraversal = hook.indexOf('const reviewHistory = await fetchBookingPages({ view: "review_eligibility" })');
    expect(visibleCommit).toBeGreaterThan(-1);
    expect(reviewTraversal).toBeGreaterThan(visibleCommit);
  });

  it("suppresses pending-review prompts and actions when reviewed-ID loading fails", () => {
    const page = read("apps/web/app/(ui-redesign)/account/bookings/page.tsx");
    const reviewsPage = read("apps/web/app/(ui-redesign)/account/reviews/page.tsx");
    const detailPage = read("apps/web/app/(ui-redesign)/account/bookings/[id]/page.tsx");
    expect(page).toContain("const reviewEligibilityUnavailable =");
    expect(page).toContain("!reviewHistoryComplete");
    expect(page).toContain("reviewedIdsLoading || Boolean(reviewedIdsError)");
    expect(page).toContain("if (reviewEligibilityUnavailable) return null");
    expect(page).toContain("if (reviewEligibilityUnavailable) return 0");
    expect(reviewsPage).toContain("!reviewHistoryComplete");
    expect(reviewsPage).toContain("reviewedIdsLoading || reviewedIdsError");
    expect(detailPage).toContain("reviewedIdsLoading || Boolean(reviewedIdsError)");
  });

  it("keeps customer-mobile history complete through the same bounded cursor contract", () => {
    const hook = read("apps/customer-mobile/hooks/useCustomerBookings.ts");
    const types = read("apps/customer-mobile/services/types/customerBookings.ts");
    const api = read("packages/api-client/src/domains/customerBookings.ts");
    expect(hook).toContain("cursor,");
    expect(hook).toContain("limit: 25,");
    expect(hook).toContain("seenCursors.has(nextCursor)");
    expect(types).toContain("pageInfo?:");
    expect(api).toContain('query.set("cursor", params.cursor)');
    expect(api).toContain('if (params) query.set("limit", String(params.limit ?? 25))');
  });

  it("loads upcoming independently and preserves paged depth during realtime refresh", () => {
    const hook = read("apps/web/hooks/useBookings.ts");
    const route = read("apps/web/app/api/customer/bookings/route.ts");
    const loader = read("apps/web/lib/customer/customerBookingPageForUser.ts");
    expect(hook).toContain('fetchBookingPages({ view: "upcoming" })');
    expect(hook).toContain("loadedPageCountRef.current");
    expect(hook).toContain("loadedPageCountRef.current += 1");
    expect(hook).toContain("const fetchEpochRef = useRef(0)");
    expect(hook).toContain("const loadingEpochRef = useRef<number | null>(null)");
    expect(hook).toContain("const loadMoreInFlightRef = useRef<Promise<void> | null>(null)");
    expect(hook).toContain("if (pendingLoadMore) await pendingLoadMore");
    expect(hook).toContain("if (fetchEpoch !== fetchEpochRef.current)");
    expect(hook).toContain("const loadMoreEpoch = ++fetchEpochRef.current");
    expect(hook).toContain("if (inheritsLoading) loadingEpochRef.current = loadMoreEpoch");
    expect(hook).toContain("loadingEpochRef.current === loadMoreEpoch");
    expect(hook).toContain("} catch (fetchError) {");
    expect(hook).toContain("fetchEpoch === fetchEpochRef.current");
    expect(hook).toContain("loadingEpochRef.current === fetchEpoch");
    expect(hook).toContain("} catch (loadMoreError) {");
    expect(hook).toContain("} finally {");
    expect(hook).toContain("setLoadingMore(false)");
    expect(hook).toContain("fetchBookings({ silent: true })");
    expect(route).toContain('url.searchParams.get("view") === "review_eligibility"');
    expect(loader).toContain('.gte("date", cutoff)');
    expect(loader).toContain('.is("completed_at", null)');
    expect(loader).toContain('if (view === "review_eligibility")');
    expect(loader).toContain('error: "Could not load complete review eligibility."');
  });

  it("rejects non-UUID cursor IDs before building a PostgREST filter", () => {
    const loader = read("apps/web/lib/customer/customerBookingPageForUser.ts");
    expect(loader).toContain("UUID_PATTERN.test(id)");
    expect(loader).toContain('return { ok: false, error: "Invalid bookings cursor.", status: 400 }');
  });

  it("preserves read-only ownership enforcement without ownership writes", () => {
    const route = read("apps/web/app/api/customer/bookings/route.ts");
    const hook = read("apps/web/hooks/useBookings.ts");
    const loader = read("apps/web/lib/customer/customerBookingPageForUser.ts");
    expect(loader).toContain("customerCanAccessBookingRow(row, userId, viewerNorm)");
    expect(loader).toContain(".is(args.ownershipColumn, null)");
    expect(route).not.toContain("claimCustomerBookingOwnership");
    expect(route).not.toContain("export async function POST");
    expect(hook).not.toContain("claimCustomerBookingOwnershipForAccount");
  });
});
