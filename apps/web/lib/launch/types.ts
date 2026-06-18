export type LaunchCheckResult = {
  id: string;
  label: string;
  passed: boolean;
  error?: string;
  details?: Record<string, unknown>;
};

export type LaunchCheckSummary = {
  passed: number;
  failed: number;
  total: number;
};

export type LaunchCheckRunResponse = {
  ok: true;
  generatedAt: string;
  results: LaunchCheckResult[];
  summary: LaunchCheckSummary;
};

export type LaunchCheckConfig = {
  customerUserId: string | null;
  cleanerId: string | null;
  cleanerUserId: string | null;
  adminUserId: string | null;
  adminEmail: string | null;
};
