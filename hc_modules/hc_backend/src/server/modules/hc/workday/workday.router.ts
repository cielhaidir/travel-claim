import {
  workdayBulkUpsertSchema,
  workdayListByPeriodSchema,
  workdaySyncImpactedAttendanceSchema,
} from "@/server/modules/hc/workday/workday.schema";

export const workdayRouterContract = {
  bulkUpsert: workdayBulkUpsertSchema,
  listByPeriod: workdayListByPeriodSchema,
  syncImpactedAttendance: workdaySyncImpactedAttendanceSchema,
};
