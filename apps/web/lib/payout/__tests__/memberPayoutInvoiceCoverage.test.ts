import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listRosterMemberWeeklyPayoutCandidates as roster } from "@/lib/payout/rosterMemberWeeklyPayoutCandidates";
import { listTeamJobMemberWeeklyPayoutCandidates as team } from "@/lib/payout/teamJobMemberWeeklyPayoutCandidates";
for (const [rail, list] of [["roster", roster], ["team", team]] as const) {
 describe(`${rail} invoice coverage`, () => {
  function client(status = "paid", fail = "", date = "2026-10-05") {
   return { from(table: string) {
    const q = { select() { return q; }, eq() { return q; }, is() { return q; }, order() { return q; }, range() { return q; }, in() { return q; },
     then(resolve: (v: unknown) => unknown) { return Promise.resolve(resolve({ error: table === fail ? { message: "unavailable" } : null,
      data: table === "monthly_invoices" ? [{ id: "invoice", status }] : table === "bookings" ? [{ id: "booking", status: "completed", date, completed_at: `${date}T12:00:00Z`, billing_type: "recurring_invoice", monthly_invoice_id: "invoice", payment_status: "success", payout_status: "eligible", payout_frozen_cents: 25000, cleaner_payout_cents: rail === "team" ? 0 : 25000, is_test: false }] : [{ id: "member", booking_id: "booking", payout_cents: 25000, bonus_cents: 0 }]
     })); }
    }; return q;
   } } as unknown as SupabaseClient;
  }
  const params = { cleanerId: "cleaner", periodStart: "2026-10-01", periodEnd: "2026-10-31", invoiceStatusById: new Map<string, string>() };
  it("includes paid member-only invoices missing from the direct-cleaner map", async () => {
   expect(await list({ ...params, admin: client() })).toHaveLength(1);
   expect(params.invoiceStatusById.size).toBe(0);
  });
  it("excludes unpaid invoices", async () => { expect(await list({ ...params, admin: client("sent") })).toHaveLength(0); });
  for (const table of ["monthly_invoices", "bookings", rail === "team" ? "team_job_member_payouts" : "booking_roster_member_payouts"]) {
   it(`reports ${table} failures`, async () => { await expect(list({ ...params, admin: client("paid", table) })).rejects.toThrow("lookup failed"); });
  }
  it("retains the historical cutoff", async () => { expect(await list({ ...params, periodStart: "2026-09-01", admin: client("paid", "", "2026-09-05") })).toHaveLength(0); });
 });
}
