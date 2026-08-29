import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../../../../..");
const chromePath = path.join(root, "components/admin/office/OfficeZohoChrome.tsx");
const conversionPath = path.join(root, "app/(ui-redesign)/office/conversion/page.tsx");

describe("SR-11H shared Office pagination contract", () => {
  it("defines a reusable accessible Office pagination control", () => {
    const source = fs.readFileSync(chromePath, "utf8");

    expect(source).toContain("export function OfficeZohoPagination");
    expect(source).toContain('aria-label="Pagination controls"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("disabled={safePage <= 1}");
    expect(source).toContain("disabled={safePage >= safeTotalPages}");
    expect(source).toContain("onPageSizeChange(Number(event.target.value))");
    expect(source).toContain("focus:ring-2");
  });

  it("uses shared pagination in Conversion without changing its paging/data contract", () => {
    const source = fs.readFileSync(conversionPath, "utf8");

    expect(source).toContain("OfficeZohoPagination");
    expect(source).toContain('useAdminData<SeoLanding>("/api/admin/seo-attribution")');
    expect(source).toContain("const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;");
    expect(source).toContain("const totalPages = Math.max(1, Math.ceil(filteredPages.length / pageSize));");
    expect(source).toContain("const pageRows = filteredPages.slice((safePage - 1) * pageSize, safePage * pageSize);");
    expect(source).toContain("page={safePage}");
    expect(source).toContain("totalPages={totalPages}");
    expect(source).toContain("pageSizeOptions={PAGE_SIZE_OPTIONS}");
    expect(source).toContain("onPageChange={setPage}");
    expect(source).toContain("setPageSize(size);");
    expect(source).toContain("setPage(1);");
    expect(source).not.toContain("<ChevronLeft");
    expect(source).not.toContain("<ChevronRight");
  });
});
