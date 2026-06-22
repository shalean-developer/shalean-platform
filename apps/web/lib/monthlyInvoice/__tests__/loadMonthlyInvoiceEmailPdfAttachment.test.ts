import { beforeEach, describe, expect, it, vi } from "vitest";

const { getZohoInvoicePdfMock } = vi.hoisted(() => ({
  getZohoInvoicePdfMock: vi.fn(),
}));

vi.mock("@/lib/zoho/zohoBooksService", () => ({
  getZohoInvoicePdf: getZohoInvoicePdfMock,
}));

import { loadMonthlyInvoiceEmailPdfAttachment } from "@/lib/monthlyInvoice/loadMonthlyInvoiceEmailPdfAttachment";

describe("loadMonthlyInvoiceEmailPdfAttachment", () => {
  beforeEach(() => {
    getZohoInvoicePdfMock.mockReset();
    process.env.ZOHO_CLIENT_ID = "test-client";
    process.env.ZOHO_REFRESH_TOKEN = "test-refresh";
  });

  it("returns null when zoho invoice id is missing", async () => {
    const result = await loadMonthlyInvoiceEmailPdfAttachment({ zohoInvoiceId: null, month: "2026-06" });
    expect(result).toBeNull();
    expect(getZohoInvoicePdfMock).not.toHaveBeenCalled();
  });

  it("returns a PDF attachment when Zoho succeeds", async () => {
    getZohoInvoicePdfMock.mockResolvedValue({
      ok: true,
      pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
    });

    const result = await loadMonthlyInvoiceEmailPdfAttachment({
      zohoInvoiceId: "253016000000224001",
      month: "2026-06",
    });

    expect(getZohoInvoicePdfMock).toHaveBeenCalledWith("253016000000224001");
    expect(result).toEqual({
      filename: "shalean-invoice-2026-06.pdf",
      content: Buffer.from([0x25, 0x50, 0x44, 0x46]).toString("base64"),
    });
  });

  it("returns null when Zoho PDF fetch fails", async () => {
    getZohoInvoicePdfMock.mockResolvedValue({ ok: false, error: "zoho_down" });

    const result = await loadMonthlyInvoiceEmailPdfAttachment({
      zohoInvoiceId: "253016000000224001",
      month: "2026-06",
    });

    expect(result).toBeNull();
  });
});
