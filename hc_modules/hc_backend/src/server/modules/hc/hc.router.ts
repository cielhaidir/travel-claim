import { attendanceRouterContract } from "@/server/modules/hc/attendance/attendance.router";
import { overtimeRouterContract } from "@/server/modules/hc/overtime/overtime.router";
import { leaveRouterContract } from "@/server/modules/hc/leave/leave.router";
import { workdayRouterContract } from "@/server/modules/hc/workday/workday.router";

export const hcRouterContract = {
  attendance: attendanceRouterContract,
  overtime: overtimeRouterContract,
  leave: leaveRouterContract,
  workday: workdayRouterContract,
};
