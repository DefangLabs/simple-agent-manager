import * as v from 'valibot';

export const ReportIssueRefsSchema = v.object({
  sessionId: v.optional(v.pipe(v.string(), v.maxLength(128))),
  taskId: v.optional(v.pipe(v.string(), v.maxLength(128))),
  nodeId: v.optional(v.pipe(v.string(), v.maxLength(128))),
  errorId: v.optional(v.pipe(v.string(), v.maxLength(200))),
  diagnosisId: v.optional(v.pipe(v.string(), v.maxLength(128))),
});

export const ReportIssueSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
  description: v.pipe(v.string(), v.minLength(1)),
  consentToAttachRefs: v.boolean(),
  refs: v.optional(ReportIssueRefsSchema),
});
