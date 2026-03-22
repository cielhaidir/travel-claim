import { z } from "zod";

export const workdayBulkUpsertSchema = z.object({
  items: z
    .array(
      z.object({
        workDate: z.coerce.date(),
        isWorkday: z.boolean(),
        workType: z.enum(["regular", "weekend", "holiday", "collective_leave"]),
        description: z.string().max(255).optional(),
      }),
    )
    .min(1),
});

export const workdayListByPeriodSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isWorkday: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const workdaySyncImpactedAttendanceSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export type WorkdayBulkUpsertInput = z.infer<typeof workdayBulkUpsertSchema>;
export type WorkdayListByPeriodInput = z.infer<typeof workdayListByPeriodSchema>;
export type WorkdaySyncImpactedAttendanceInput = z.infer<typeof workdaySyncImpactedAttendanceSchema>;
