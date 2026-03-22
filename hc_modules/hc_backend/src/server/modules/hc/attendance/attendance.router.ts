import {
  attendanceCreateCheckInSchema,
  attendanceCreateCheckOutSchema,
  attendanceListByPeriodSchema,
  attendanceNightlyFinalizeSchema,
} from "@/server/modules/hc/attendance/attendance.schema";

export const attendanceRouterContract = {
  createCheckIn: attendanceCreateCheckInSchema,
  createCheckOut: attendanceCreateCheckOutSchema,
  listByPeriod: attendanceListByPeriodSchema,
  nightlyFinalizeStatus: attendanceNightlyFinalizeSchema,
};
