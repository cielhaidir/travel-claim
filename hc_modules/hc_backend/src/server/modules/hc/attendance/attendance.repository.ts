import type { AttendanceRow } from "@/server/modules/hc/attendance/attendance.types";

export type AttendanceRepository = {
  findActiveUserById(userId: string): Promise<{ id: string } | null>;
  findWorkday(date: Date): Promise<{ isWorkday: boolean } | null>;
  findAttendance(userId: string, attendanceDate: Date): Promise<AttendanceRow | null>;
  createAttendance(input: Omit<AttendanceRow, "id">): Promise<AttendanceRow>;
  updateAttendance(id: string, patch: Partial<AttendanceRow>): Promise<AttendanceRow>;
  listAttendanceByPeriod(input: {
    userId: string;
    startDate: Date;
    endDate: Date;
    skip: number;
    take: number;
  }): Promise<AttendanceRow[]>;
  countAttendanceByPeriod(input: {
    userId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<number>;
  listActiveUsers(): Promise<Array<{ id: string }>>;
  hasApprovedLeaveOnDate(userId: string, date: Date): Promise<boolean>;
};
