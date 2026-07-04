import { describe, expect, it, vi, beforeEach } from "vitest";

import { ensureSalesDocumentCustomer } from "@/lib/salesDocument/ensureSalesDocumentCustomer";

const DOC_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/customer/ensureCustomerAccount", () => ({
  ensureCustomerAccount: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

import { ensureCustomerAccount } from "@/lib/customer/ensureCustomerAccount";

function mockAdmin(row: Record<string, unknown> | null) {
  const updateChain = {
    eq: vi.fn().mockImplementation(() => ({
      is: vi.fn().mockResolvedValue({ error: null }),
      then: undefined,
    })),
  };
  updateChain.eq.mockImplementation((col: string) => {
    if (col === "id") {
      return Promise.resolve({ error: null });
    }
    return { is: vi.fn().mockResolvedValue({ error: null }) };
  });

  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    update: vi.fn().mockReturnValue(updateChain),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

describe("ensureSalesDocumentCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing customer_id without creating", async () => {
    const admin = mockAdmin({
      id: DOC_ID,
      customer_id: USER_ID,
      customer_name: "Jane",
      customer_email: "jane@example.com",
      customer_phone: "+27821234567",
    });

    const result = await ensureSalesDocumentCustomer(admin as never, DOC_ID);

    expect(result).toEqual({ ok: true, customerId: USER_ID, created: false });
    expect(ensureCustomerAccount).not.toHaveBeenCalled();
  });

  it("creates customer and links document when customer_id is missing", async () => {
    const admin = mockAdmin({
      id: DOC_ID,
      customer_id: null,
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      customer_phone: "0821234567",
    });

    vi.mocked(ensureCustomerAccount).mockResolvedValue({
      ok: true,
      userId: USER_ID,
      loginEmail: "jane@example.com",
      reused: false,
    });

    const result = await ensureSalesDocumentCustomer(admin as never, DOC_ID);

    expect(result).toEqual({ ok: true, customerId: USER_ID, created: true });
    expect(ensureCustomerAccount).toHaveBeenCalledWith(admin, {
      fullName: "Jane Doe",
      phone: "0821234567",
      email: "jane@example.com",
      source: "sales_document_quote",
    });
    expect(admin.from).toHaveBeenCalledWith("sales_documents");
  });
});
