export const REVIEWS_PAGE_SIZE = 12;
export function parseReviewsPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= Math.floor(2147483647 / REVIEWS_PAGE_SIZE) ? page : 1;
}
export function reviewsPagePath(page: number): string {
  return page > 1 ? `/reviews?page=${page}` : "/reviews";
}
