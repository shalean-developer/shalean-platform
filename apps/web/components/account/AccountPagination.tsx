import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AccountPaginationProps = {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  label?: string;
};

export function AccountPagination({
  page,
  pageCount,
  onPage,
  label = "Pagination",
}: AccountPaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
      aria-label={label}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label={`Go to page ${Math.max(1, page - 1)}`}
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>

      <span className="text-sm text-muted-foreground" aria-live="polite">
        Page {page} of {pageCount}
      </span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        aria-label={`Go to page ${Math.min(pageCount, page + 1)}`}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
