import { describe, expect, it, vi, beforeEach } from "vitest";

import { backfillSalesDocumentQuoteCustomers } from "@/lib/salesDocument/backfillSalesDocumentQuoteCustomers";

const DOC_A = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/salesDocument/ensureSalesDocumentCustomer", () => ({
  ensureSalesDocumentCustomer: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

import { ensureSalesDocumentCustomer } from "@/lib/salesDocument/ensureSalesDocumentCustomer";

function mockAdmin(rows: Array<Record<string, unknown>>, emptyOnSecondPage = false) {
  let call = 0;
  const listChain = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockImplementation(() => {
      call += 1;
      if (call > 1 && emptyOnSecondPage) {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: rows, error: null });
    }),
  };

  const propagateChain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue({ error: null }),
  };

  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };

  return {
    from: vi.fn(() => ({
      ...listChain,
      update: vi.fn().mockReturnValue(propagateChain),
    })),
    _propagateChain: propagateChain,
    _updateChain: updateChain,
  };
}

describe("backfillSalesDocumentQuoteCustomers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dry-run counts rows without calling ensure", async () => {
    const admin = mockAdmin([{ id: DOC_A, customer_id: null }], true);

    const result = await backfillSalesDocumentQuoteCustomers(admin as never, { apply: false });

    expect(result).toMatchObject({ scanned: 1, linked: 1, failed: 0 });
    expect(ensureSalesDocumentCustomer).not.toHaveBeenCalled();
  });

  it("apply links each document and propagates to related invoices", async () => {
    const admin = mockAdmin([{ id: DOC_A, customer_id: null }], true);

    vi.mocked(ensureSalesDocumentCustomer).mockResolvedValue({
      ok: true,
      customerId: USER_ID,
      created: true,
    });

    const result = await backfillSalesDocumentQuoteCustomers(admin as never, { apply: true });

    expect(result).toMatchObject({ scanned: 1, linked: 1, created: 1, failed: 0 });
    expect(ensureSalesDocumentCustomer).toHaveBeenCalledWith(admin, DOC_A);
  });
});
