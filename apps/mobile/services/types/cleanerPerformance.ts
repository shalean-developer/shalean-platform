export type CleanerPerformanceComponentWire = {
  score: number | null;
  weight: number;
  evidenceCount: number;
  label: string;
};

export type CleanerPerformanceScorecardWire = {
  cleanerId: string;
  cleanerName: string;
  status: string | null;
  overallScore: number | null;
  grade: "A" | "B" | "C" | "D" | "Needs evidence";
  evidenceCoverage: number;
  period: { from: string; to: string };
  components: {
    quality: CleanerPerformanceComponentWire;
    customerFeedback: CleanerPerformanceComponentWire;
    reliability: CleanerPerformanceComponentWire;
    completion: CleanerPerformanceComponentWire;
    attendance: CleanerPerformanceComponentWire;
  };
  complaints: {
    qualityRelatedCases: number;
    openQualityCases: number;
    penalty: number;
  };
  facts: {
    rosterAssignments: number;
    completedBookings: number;
    reviews: number;
    qaInspections: number;
    attendanceObservations: number;
    totalOffers: number;
    acceptedOffers: number;
  };
};

export type CleanerPerformanceResponse = {
  scorecard: CleanerPerformanceScorecardWire;
  from: string;
  to: string;
  meta: { days: number };
};
