import type { HcAttendanceStatus, HcAttendanceSource } from "@/server/modules/hc/shared/hc.types";

export type AttendanceRow = {
  id: string;
  userId: string;
  attendanceDate: Date;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  attendanceStatus: HcAttendanceStatus;
  source: HcAttendanceSource | null;
  notes: string | null;
};
