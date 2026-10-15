import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../recurringBookingInsertGuards", async (importOriginal) => ({
  ...await importOriginal<typeof import("../recurringBookingInsertGuards")>(),
  recurringPlanOccurrenceRowExists: vi.fn().mockResolvedValue(false),
}));
import { recurringPlanOccurrenceRowExists } from "../recurringBookingInsertGuards";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findRecurringPrepaymentCycleForDate, findReservedRecurringPrepaymentAllocation } from "../recurringPrepaymentLedger";
import { insertRecurringOccurrenceBooking } from "../insertRecurringOccurrenceBooking";

type ReadResult = { data: unknown; error: { message: string } | null };
function adminFor(result: ReadResult, packageResult: ReadResult = result) {
  const tables: string[] = [];
  const admin = { from: vi.fn((table: string) => {
    tables.push(table);
    if (!['recurring_prepaid_packages', 'recurring_prepaid_allocations'].includes(table)) {
      throw new Error(`Unexpected access before ledger preflight: ${table}`);
    }
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'contains', 'in', 'order', 'limit']) q[method] = () => q;
    q.maybeSingle = async () => table === 'recurring_prepaid_packages' ? packageResult : result;
    return q;
  }) };
  return { admin: admin as unknown as SupabaseClient, tables };
}

const args = {
  recurring: { id: '11111111-1111-4111-8111-111111111111', customer_id: '22222222-2222-4222-8222-222222222222', price: 250,
    booking_snapshot_template: { v: 1, locked: { locked: true, lockedAt: '2026-10-01T08:00:00Z', date: '2026-10-25', time: '09:00', finalPrice: 250, finalHours: 3, rooms: 1, bathrooms: 1, extras: [], extraRooms: 0, surge: 1, service: 'standard', location: 'Test address' } } },
  occurrenceDateYmd: '2026-10-25', customerEmail: 'test@example.com', customerName: 'Test', customerPhone: null,
};

describe('recurring prepayment read safety', () => {
  beforeEach(() => vi.mocked(recurringPlanOccurrenceRowExists).mockReset().mockResolvedValue(false));
  it('skips an already-generated paid package visit before reserved allocation lookup', async () => {
    vi.mocked(recurringPlanOccurrenceRowExists).mockResolvedValue(true);
    const { admin, tables } = adminFor({ data: null, error: { message: 'applied allocation is not reserved' } });
    expect(await insertRecurringOccurrenceBooking(admin, args)).toEqual({ ok: false, error: 'duplicate_occurrence' });
    expect(tables).toEqual([]);
  });
  it.each(['schema cache missing', 'database unavailable', 'permission denied'])('rejects allocation read failure before booking creation: %s', async (message) => {
    const { admin, tables } = adminFor({ data: null, error: { message } });
    expect(await insertRecurringOccurrenceBooking(admin, args)).toEqual({ ok: false, error: `recurring_allocation_lookup_failed:${message}` });
    expect(tables).toEqual(['recurring_prepaid_allocations']);
  });
  it('does not treat a failed package lookup as an empty cycle', async () => {
    const { admin } = adminFor({ data: null, error: { message: 'missing packages' } });
    await expect(findRecurringPrepaymentCycleForDate(admin, 'plan', '2026-10-25')).rejects.toThrow('recurring_package_lookup_failed:missing packages');
  });
  it('returns a package read failure without creating a replacement booking', async () => {
    const { admin, tables } = adminFor({ data: null, error: null }, { data: null, error: { message: 'missing packages' } });
    expect(await insertRecurringOccurrenceBooking(admin, args)).toEqual({ ok: false, error: 'recurring_package_lookup_failed:missing packages' });
    expect(tables).toEqual(['recurring_prepaid_allocations', 'recurring_prepaid_packages']);
  });
  it('holds covered unpaid visits without creating another package or booking', async () => {
    const { admin, tables } = adminFor({ data: null, error: null }, { data: { id: 'package', status: 'pending_payment' }, error: null });
    expect(await insertRecurringOccurrenceBooking(admin, args)).toEqual({ ok: false, error: 'recurring_package_payment_pending' });
    expect(tables).toEqual(['recurring_prepaid_allocations', 'recurring_prepaid_packages']);
  });
  it('allows an actually empty lookup', async () => {
    const { admin } = adminFor({ data: null, error: null });
    expect(await findRecurringPrepaymentCycleForDate(admin, 'plan', '2026-10-25')).toBeNull();
    expect(await findReservedRecurringPrepaymentAllocation(admin, 'plan', '2026-10-25')).toBeNull();
  });
  it('rejects a reserved allocation without payment evidence', async () => {
    const { admin } = adminFor({ data: { id: 'allocation', recurring_prepaid_packages: { payment_completed_at: null } }, error: null });
    await expect(findReservedRecurringPrepaymentAllocation(admin, 'plan', '2026-10-25')).rejects.toThrow('recurring_allocation_payment_evidence_missing');
  });
  it('retains an existing paid allocation and exact amount', async () => {
    const { admin } = adminFor({ data: { id: 'allocation', package_id: 'package', allocated_zar: 250, recurring_prepaid_packages: { payment_completed_at: '2026-10-01T08:00:00Z' } }, error: null });
    expect(await findReservedRecurringPrepaymentAllocation(admin, 'plan', '2026-10-25')).toEqual({ allocationId: 'allocation', packageId: 'package', allocatedZar: 250, paidAt: '2026-10-01T08:00:00Z' });
  });
});
