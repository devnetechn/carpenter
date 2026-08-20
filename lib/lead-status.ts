export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "CONSULTATION_SCHEDULED",
  "ESTIMATE_SENT",
  "FOLLOW_UP",
  "APPROVED",
  "SCHEDULED",
  "COMPLETED",
  "LOST",
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];
