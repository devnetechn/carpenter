export const JOB_STATUSES = ["SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;

export type JobStatusValue = (typeof JOB_STATUSES)[number];
