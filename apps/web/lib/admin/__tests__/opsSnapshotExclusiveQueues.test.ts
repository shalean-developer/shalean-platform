import { describe, expect, it } from "vitest";
import {
  classifyAttentionQueue,
  computeOpsSnapshotFromRows,
  rowMatchesAttentionFilter,
  type AttentionQueueFilter,
  type OpsSnapshotRow,
} from "@/lib/admin/opsSnapshot";

const NOW_MS = new Date("2026-05-14T08:00:00.000Z").getTime();
const SLA_MINUTES = 10;
const QUEUES: AttentionQueueFilter[] = ["sla", "unassignable", "unassigned", "starting-soon"];

function row(overrides: Partial<OpsSnapshotRow>): OpsSnapshotRow {
  return {
    id: overrides.id ?? "booking-1",
    status: overrides.status ?? "pending",
    date: overrides.date ?? "2026-05-14",
    time: overrides.time ?? "11:00",
    cleaner_id: overrides.cleaner_id ?? null,
    team_id: overrides.team_id ?? null,
    dispatch_status: overrides.dispatch_status ?? null,
    became_pending_at: overrides.became_pending_at ?? null,
    created_at: overrides.created_at ?? "2026-05-14T07:50:00.000Z",
    total_paid_zar: overrides.total_paid_zar ?? null,
    amount_paid_cents: overrides.amount_paid_cents ?? null,
  };
}

function matchingQueues(r: OpsSnapshotRow): AttentionQueueFilter[] {
  return QUEUES.filter((q) => rowMatchesAttentionFilter(r, q, NOW_MS, SLA_MINUTES));
}

describe("exclusive admin attention queue classification", () => {
  it("puts one booking in only one queue", () => {
    const r = row({
      dispatch_status: "searching",
      became_pending_at: "2026-05-14T07:40:00.000Z",
      amount_paid_cents: 50_000,
      time: "09:00",
    });

    expect(matchingQueues(r)).toEqual(["sla"]);
  });

  it("SLA breach wins over lower buckets", () => {
    const r = row({
      dispatch_status: "offered",
      became_pending_at: "2026-05-14T07:40:00.000Z",
      amount_paid_cents: 50_000,
      time: "09:00",
    });

    expect(classifyAttentionQueue(r, NOW_MS, SLA_MINUTES)).toBe("sla");
    expect(rowMatchesAttentionFilter(r, "unassigned", NOW_MS, SLA_MINUTES)).toBe(false);
    expect(rowMatchesAttentionFilter(r, "starting-soon", NOW_MS, SLA_MINUTES)).toBe(false);
  });

  it("unassignable wins over unassigned paid", () => {
    const r = row({
      dispatch_status: "unassignable",
      amount_paid_cents: 50_000,
      time: "11:00",
    });

    expect(classifyAttentionQueue(r, NOW_MS, SLA_MINUTES)).toBe("unassignable");
    expect(matchingQueues(r)).toEqual(["unassignable"]);
  });

  it("unassigned paid wins over starts soon", () => {
    const r = row({
      dispatch_status: null,
      amount_paid_cents: 50_000,
      time: "09:00",
    });

    expect(classifyAttentionQueue(r, NOW_MS, SLA_MINUTES)).toBe("unassigned");
    expect(matchingQueues(r)).toEqual(["unassigned"]);
  });

  it("does not count assigned booking as unassignable when dispatch_status is stale", () => {
    const r = row({
      dispatch_status: "unassignable",
      team_id: "team-1",
      amount_paid_cents: 50_000,
    });

    expect(classifyAttentionQueue(r, NOW_MS, SLA_MINUTES)).toBe(null);
    expect(matchingQueues(r)).toEqual([]);
  });

  it("team assignment clears unassignable queue", () => {
    const r = row({
      dispatch_status: "unassignable",
      cleaner_id: "cleaner-1",
      amount_paid_cents: 50_000,
    });

    expect(classifyAttentionQueue(r, NOW_MS, SLA_MINUTES)).toBe(null);
  });

  it("counts match exclusive classification", () => {
    const rows = [
      row({
        id: "sla",
        dispatch_status: "searching",
        became_pending_at: "2026-05-14T07:40:00.000Z",
        amount_paid_cents: 50_000,
        time: "09:00",
      }),
      row({ id: "unassignable", dispatch_status: "unassignable", amount_paid_cents: 50_000 }),
      row({ id: "unassigned", amount_paid_cents: 50_000, time: "11:00" }),
      row({ id: "soon", amount_paid_cents: null, total_paid_zar: null, time: "11:00" }),
      row({ id: "assigned", cleaner_id: "cleaner-1", amount_paid_cents: 50_000, time: "09:00" }),
    ];

    const snapshot = computeOpsSnapshotFromRows(rows, NOW_MS);

    expect(snapshot).toMatchObject({
      slaBreaches: 1,
      unassignable: 1,
      unassigned: 1,
      startingSoon: 1,
    });
    expect(
      rows
        .map((r) => classifyAttentionQueue(r, NOW_MS, SLA_MINUTES))
        .filter(Boolean),
    ).toEqual(["sla", "unassignable", "unassigned", "starting-soon"]);
  });
});
