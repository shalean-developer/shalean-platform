export type CleanerTrainingModuleWire = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  isRequired: boolean;
  validityDays: number | null;
};

export type CleanerTrainingAssignmentWire = {
  id: string;
  module_id: string;
  status: "assigned" | "in_progress" | "completed" | "expired" | "waived" | string;
  assigned_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  score: number | null;
  notes: string | null;
};

export type CleanerComplianceRecordWire = {
  id: string;
  requirement_code: string;
  requirement_label: string;
  status: "missing" | "pending" | "valid" | "expired" | "rejected" | "waived" | string;
  issued_at: string | null;
  expires_at: string | null;
  verified_at: string | null;
  notes: string | null;
};

export type CleanerTrainingComplianceResponse = {
  cleaner: {
    cleanerId: string;
    cleanerName: string;
    ready: boolean;
    overdueTraining: number;
    nonCompliant: number;
    trainingAssigned: number;
    trainingCompleted: number;
    complianceRecords: number;
  } | null;
  modules: CleanerTrainingModuleWire[];
  assignments: CleanerTrainingAssignmentWire[];
  compliance: CleanerComplianceRecordWire[];
};
