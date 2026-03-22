import { z } from "zod";

export const overtimeSubmitSchema = z.object({
  userId: z.string().min(1),
  overtimeDate: z.coerce.date(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  reason: z.string().min(3).max(2000),
});

export const overtimeApproveSchema = z.object({
  requestId: z.string().min(1),
  approverId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

export const overtimeRejectSchema = z.object({
  requestId: z.string().min(1),
  approverId: z.string().min(1),
  rejectionReason: z.string().min(3).max(1000),
});

export const overtimeListSchema = z.object({
  userId: z.string().optional(),
  status: z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type OvertimeSubmitInput = z.infer<typeof overtimeSubmitSchema>;
export type OvertimeApproveInput = z.infer<typeof overtimeApproveSchema>;
export type OvertimeRejectInput = z.infer<typeof overtimeRejectSchema>;
export type OvertimeListInput = z.infer<typeof overtimeListSchema>;
