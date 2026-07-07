export const CLEANER_SUBMISSION_TYPES = ["report", "feedback"] as const;
export type CleanerSubmissionType = (typeof CLEANER_SUBMISSION_TYPES)[number];

export const CLEANER_REPORT_SUBJECTS = [
  "Harassment or bullying",
  "Safety concern",
  "Unfair treatment",
  "Policy violation",
  "Other",
] as const;

export const CLEANER_FEEDBACK_SUBJECTS = [
  "App experience",
  "Scheduling",
  "Payouts",
  "Support",
  "General suggestion",
  "Other",
] as const;

export const CLEANER_REPORT_FEEDBACK_STATUSES = ["open", "reviewing", "resolved", "closed"] as const;
export type CleanerReportFeedbackStatus = (typeof CLEANER_REPORT_FEEDBACK_STATUSES)[number];

export function subjectsForSubmissionType(type: CleanerSubmissionType): readonly string[] {
  return type === "report" ? CLEANER_REPORT_SUBJECTS : CLEANER_FEEDBACK_SUBJECTS;
}

export function validateCleanerReportFeedbackBody(body: unknown): {
  ok: true;
  submissionType: CleanerSubmissionType;
  subject: string | null;
  message: string;
} | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const raw = body as { submission_type?: unknown; subject?: unknown; message?: unknown };
  const submissionType = String(raw.submission_type ?? "").trim().toLowerCase();
  if (!CLEANER_SUBMISSION_TYPES.includes(submissionType as CleanerSubmissionType)) {
    return { ok: false, error: "submission_type must be report or feedback." };
  }
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length < 10 || message.length > 8000) {
    return { ok: false, error: "Message must be between 10 and 8000 characters." };
  }
  const subjectRaw = typeof raw.subject === "string" ? raw.subject.trim() : "";
  const subject = subjectRaw.length > 0 ? subjectRaw.slice(0, 120) : null;
  return {
    ok: true,
    submissionType: submissionType as CleanerSubmissionType,
    subject,
    message,
  };
}
