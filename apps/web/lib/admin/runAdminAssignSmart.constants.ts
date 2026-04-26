/**
 * SLA minutes threshold for extreme escalation (admin UI + assign-smart API).
 * Lives in a dependency-free module so client components can import it without
 * pulling `runAdminAssignSmart` (which transitively imports server-only dispatch).
 */
export const EXTREME_SLA_AUTO_ESCALATE_MINUTES = 60;
