/** Rows per RPC page (bounded in SQL to 500). */
export const USER_SELECTED_RECOVERY_PAGE_SIZE = 80;
/** Max pages per cron tick so a single run cannot scan unbounded backlog. */
export const USER_SELECTED_RECOVERY_MAX_PAGES = 6;

// Future (high volume): keyset pagination in `list_bookings_due_user_selected_recovery`
// using `(dispatch_next_recovery_at, id) > ($1,$2)` instead of OFFSET to avoid deep scans.
