import {loadCurrentTeamBookings} from "@/lib/booking/loadCurrentTeamBookings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  syncBookingCleanersForTeamBooking,
  resyncBookingCleanersForTeamNonFinalizedJobs,
} from "@/lib/booking/syncBookingCleanersForTeamBooking";
import { reassignPayoutOwnerBeforeTeamMemberRemove } from "@/lib/admin/reassignPayoutOwnerBeforeTeamMemberRemove";
import { setTeamLeadCleaner } from "@/lib/admin/setTeamLeadCleaner";
const { persist } = vi.hoisted(() => ({
  persist: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/payout/persistCleanerPayout", () => ({
  persistCleanerPayoutIfUnset: persist,
}));
function database() {
  const rows = [
    { id: "old", date: "2026-09-30" },
    { id: "padded", date: " 2026-09-30 " },
    { id: "unknown", date: null },
    { id: "new", date: " 2026-10-01 " },
  ];
  const writes: Array<{ id: unknown; patch: unknown }> = [];
  const rpc = vi.fn(async () => ({ error: null }));
  const filters: string[] = [];
  return {
    rows,
    writes,
    rpc,
    filters,
    from(table: string) {
      let id: unknown = null,
        patch: unknown = null;
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          if (col === "id") id = v;
          return q;
        },
        neq: () => q,
        is: () => q,
        gte: (col: string, v: string) => {
          filters.push(`${col}:${v}`);
          return q;
        },
        limit: () => q,
        order: () => q,
        range: () => q,
        update: (p: unknown) => {
          patch = p;
          return q;
        },
        maybeSingle: async () => ({
          error: null,
          data:
            table === "bookings"
              ? {
                  ...rows.find((r) => r.id === id),
                  is_team_job: true,
                  cleaner_id: "lead",
                  payout_owner_cleaner_id: "lead",
                  cleaner_line_earnings_finalized_at: null,
                }
              : table === "teams"
                ? { lead_cleaner_id: "lead" }
                : {
                    cleaner_id: "lead",
                    active_from: "2020-01-01",
                    active_to: null,
                  },
        }),
        then: (resolve: (v: unknown) => unknown) => {
          if (patch && table === "bookings") writes.push({ id, patch });
          return Promise.resolve({
            data:
              table === "bookings"
                ? rows
                : table === "team_members"
                  ? [
                      {
                        cleaner_id: "lead",
                        active_from: "2020-01-01",
                        active_to: null,
                      },
                    ]
                  : [],
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
}
beforeEach(() => persist.mockClear());
describe("historical team roster boundary", () => {
  it("loads padded forward rows beyond a full page of historical candidates",async()=>{
    const rows=Array.from({length:501},(_,i)=>({id:String(i),date:i===500?' 2026-10-02 ':'2026-09-30'}));
    const q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,range:async(from:number,to:number)=>({data:rows.slice(from,to+1),error:null})};
    expect(await loadCurrentTeamBookings({from:()=>q} as never,'team')).toEqual([{id:'500',date:'2026-10-02'}]);
  });
  it.each(["old", "padded", "unknown"])(
    "blocks direct roster RPC for %s",
    async (id) => {
      const db = database();
      expect(await syncBookingCleanersForTeamBooking(db as never, id)).toEqual({
        ok: false,
        message: "historical_payout_item_deferred",
      });
      expect(db.rpc).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    },
  );
  it("resyncs only the forward booking, even if the database returns historical rows", async () => {
    const db = database();
    expect(
      await resyncBookingCleanersForTeamNonFinalizedJobs(db as never, "team"),
    ).toEqual({ synced: 1, failed: 0 });
    expect(db.filters).not.toContain("date:2026-10-01");
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith(
      "sync_booking_cleaners_for_team_booking",
      { p_booking_id: "new", p_source: "admin" },
    );
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "new" }),
    );
  });
  it("preserves historical payout owners when removing a member", async () => {
    const db = database();
    expect(
      await reassignPayoutOwnerBeforeTeamMemberRemove(db as never, {
        teamId: "team",
        cleanerId: "removed",
      }),
    ).toEqual({ ok: true, reassigned: 1 });
    expect(db.writes.map((w) => w.id)).toEqual(["new"]);
  });
  it("preserves historical payout owners when appointing a lead", async () => {
    const db = database();
    expect(await setTeamLeadCleaner(db as never, "team", "lead")).toEqual({
      ok: true,
    });
    expect(db.writes.map((w) => w.id)).toEqual(["new"]);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
});
