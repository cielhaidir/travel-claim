import { z } from "zod";

export const attendanceCreateCheckInSchema = z.object({
  userId: z.string().min(1),
  attendanceDate: z.coerce.date(),
  checkInAt: z.coerce.date(),
  source: z.enum(["mobile", "web", "machine", "import"]),
  notes: z.string().max(1000).optional(),
});

export const attendanceCreateCheckOutSchema = z.object({
  userId: z.string().min(1),
  attendanceDate: z.coerce.date(),
  checkOutAt: z.coerce.date(),
  notes: z.string().max(1000).optional(),
});

export const attendanceListByPeriodSchema = z.object({
  userId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const attendanceNightlyFinalizeSchema = z.object({
  targetDate: z.coerce.date().optional(),
});

export type AttendanceCreateCheckInInput = z.infer<typeof attendanceCreateCheckInSchema>;
export type AttendanceCreateCheckOutInput = z.infer<typeof attendanceCreateCheckOutSchema>;
export type AttendanceListByPeriodInput = z.infer<typeof attendanceListByPeriodSchema>;
export type AttendanceNightlyFinalizeInput = z.infer<typeof attendanceNightlyFinalizeSchema>;
