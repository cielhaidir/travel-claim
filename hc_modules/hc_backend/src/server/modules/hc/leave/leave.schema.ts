import { z } from "zod";

export const leaveSubmitSchema = z.object({
  userId: z.string().min(1),
  leaveType: z.enum(["annual", "sick", "unpaid", "maternity", "paternity", "special"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().max(2000).optional(),
});

export const leaveApproveSchema = z.object({
  requestId: z.string().min(1),
  approverId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

export const leaveRejectSchema = z.object({
  requestId: z.string().min(1),
  approverId: z.string().min(1),
  rejectionReason: z.string().min(3).max(1000),
});

export const leaveListSchema = z.object({
  userId: z.string().optional(),
  leaveType: z.enum(["annual", "sick", "unpaid", "maternity", "paternity", "special"]).optional(),
  status: z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type LeaveSubmitInput = z.infer<typeof leaveSubmitSchema>;
export type LeaveApproveInput = z.infer<typeof leaveApproveSchema>;
export type LeaveRejectInput = z.infer<typeof leaveRejectSchema>;
export type LeaveListInput = z.infer<typeof leaveListSchema>;
