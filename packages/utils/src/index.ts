/**
 * @shalean/utils — isomorphic helpers (phone, money, dates, contact).
 * Prefer subpath imports when two modules export the same symbol name
 * (e.g. formatZar vs cleanerZarFormat both export formatZarFromCents).
 */
export * from "./phone";
export * from "./normalizeEmail";
export * from "./formatZar";
export {
  formatZarFromCents as formatCleanerZarFromCents,
  formatCleanerJobEarningsLabel,
  formatZarWhole,
} from "./cleanerZarFormat";
export * from "./johannesburgBookingClock";
export * from "./johannesburgMonth";
export * from "./distance";
export * from "./cleanerDisplayFirstName";
export * from "./shaleanBillingContactEmail";
export * from "./customerProfileContactFields";
