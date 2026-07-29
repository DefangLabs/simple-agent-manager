import * as v from 'valibot';

export const ReportIssueRefsSchema = v.object({
  sessionId: v.optional(v.string()),
  taskId: v.optional(v.string()),
  nodeId: v.optional(v.string()),
  errorId: v.optional(v.string()),
  diagnosisId: v.optional(v.string()),
});

export const ReportIssueSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
  description: v.pipe(v.string(), v.minLength(1)),
  consentToAttachRefs: v.boolean(),
  refs: v.optional(ReportIssueRefsSchema),
});
