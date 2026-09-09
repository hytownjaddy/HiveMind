import { z } from "zod";

/*
 * Identifier formats (D-038, UI-SYSTEM §5). Formats are shared by UI, API, CLI,
 * logs, and D1. Generators produce the canonical zero-padded form.
 */

export const workOrderIdSchema = z
  .string()
  .regex(/^HM-WO-\d{4,}$/u, "invalid-work-order-id");
export const labSessionIdSchema = z
  .string()
  .regex(/^HM-LAB-\d{6}$/u, "invalid-lab-session-id");
export const incidentIdSchema = z
  .string()
  .regex(/^HM-INC-\d{8}-\d{3}$/u, "invalid-incident-id");
export const interviewIdSchema = z
  .string()
  .regex(/^HM-INT-\d{5}$/u, "invalid-interview-id");
export const lessonIdSchema = z
  .string()
  .regex(/^HM-LESSON-[a-z0-9-]+-\d{2}$/u, "invalid-lesson-id");
export const jobPostingIdSchema = z
  .string()
  .regex(/^HM-JOB-[a-z0-9-]+-\d{3}$/u, "invalid-job-id");
export const reviewItemIdSchema = z
  .string()
  .regex(/^HM-RVW-\d{4,}$/u, "invalid-review-id");
export const learnerIdSchema = z.string().regex(/^HM-LRN-\d{6}$/u, "invalid-learner-id");
export const contentVersionIdSchema = z
  .string()
  .regex(/^HM-CV-\d{4,}$/u, "invalid-content-version-id");
export const attemptIdSchema = z.string().regex(/^HM-ATT-\d{6,}$/u, "invalid-attempt-id");
export const problemInstanceIdSchema = z
  .string()
  .regex(/^HM-PI-\d{6,}$/u, "invalid-problem-instance-id");
export const evidenceIdSchema = z
  .string()
  .regex(/^HM-EV-\d{6,}$/u, "invalid-evidence-id");

export type WorkOrderId = z.infer<typeof workOrderIdSchema>;
export type LabSessionId = z.infer<typeof labSessionIdSchema>;
export type IncidentId = z.infer<typeof incidentIdSchema>;
export type InterviewId = z.infer<typeof interviewIdSchema>;
export type LessonId = z.infer<typeof lessonIdSchema>;
export type JobPostingId = z.infer<typeof jobPostingIdSchema>;
export type ReviewItemId = z.infer<typeof reviewItemIdSchema>;
export type LearnerId = z.infer<typeof learnerIdSchema>;
export type ContentVersionId = z.infer<typeof contentVersionIdSchema>;
export type AttemptId = z.infer<typeof attemptIdSchema>;
export type ProblemInstanceId = z.infer<typeof problemInstanceIdSchema>;
export type EvidenceId = z.infer<typeof evidenceIdSchema>;

function padded(sequence: number, width: number, label: string): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`${label} sequence must be a positive integer`);
  }
  return String(sequence).padStart(width, "0");
}

export function formatWorkOrderId(sequence: number): WorkOrderId {
  return `HM-WO-${padded(sequence, 4, "work order")}`;
}

export function formatLabSessionId(sequence: number): LabSessionId {
  const value = padded(sequence, 6, "lab session");
  if (value.length !== 6) {
    throw new RangeError("lab session sequence exceeds six digits");
  }
  return `HM-LAB-${value}`;
}

export function formatIncidentId(date: string, sequence: number): IncidentId {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new RangeError("incident date must be YYYY-MM-DD");
  }
  return `HM-INC-${date.replaceAll("-", "")}-${padded(sequence, 3, "incident")}`;
}

export function formatInterviewId(sequence: number): InterviewId {
  return `HM-INT-${padded(sequence, 5, "interview")}`;
}

export function formatLessonId(courseSlug: string, order: number): LessonId {
  if (!/^[a-z0-9-]+$/u.test(courseSlug)) {
    throw new RangeError("lesson course slug must be lowercase letters, digits, dashes");
  }
  return `HM-LESSON-${courseSlug}-${padded(order, 2, "lesson")}`;
}

export function formatReviewItemId(sequence: number): ReviewItemId {
  return `HM-RVW-${padded(sequence, 4, "review item")}`;
}

export function formatLearnerId(sequence: number): LearnerId {
  return `HM-LRN-${padded(sequence, 6, "learner")}`;
}

export function formatContentVersionId(sequence: number): ContentVersionId {
  return `HM-CV-${padded(sequence, 4, "content version")}`;
}

export function formatAttemptId(sequence: number): AttemptId {
  return `HM-ATT-${padded(sequence, 6, "attempt")}`;
}

export function formatProblemInstanceId(sequence: number): ProblemInstanceId {
  return `HM-PI-${padded(sequence, 6, "problem instance")}`;
}

export function formatEvidenceId(sequence: number): EvidenceId {
  return `HM-EV-${padded(sequence, 6, "evidence")}`;
}

/** Sequence number of any zero-padded identifier, e.g. `HM-WO-0184` → 184. */
export function idSequence(id: string): number {
  const match = /(\d+)$/u.exec(id);
  if (match === null) {
    throw new RangeError(`identifier has no trailing sequence: ${id}`);
  }
  return Number(match[1]);
}
