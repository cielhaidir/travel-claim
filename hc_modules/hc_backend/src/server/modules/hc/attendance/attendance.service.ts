import {
  type AttendanceCreateCheckInInput,
  type AttendanceCreateCheckOutInput,
  type AttendanceListByPeriodInput,
  type AttendanceNightlyFinalizeInput,
} from "@/server/modules/hc/attendance/attendance.schema";
import type { AttendanceRepository } from "@/server/modules/hc/attendance/attendance.repository";
import type { HcAttendanceStatus, Paginated } from "@/server/modules/hc/shared/hc.types";
import { isWeekend, toDateOnlyUtc } from "@/server/modules/hc/shared/date.util";
import type { AttendanceRow } from "@/server/modules/hc/attendance/attendance.types";

function deriveStatus(checkInAt: Date, isWorkday: boolean): HcAttendanceStatus {
  if (!isWorkday) return "holiday";
  const late = checkInAt.getHours() > 9 || (checkInAt.getHours() === 9 && checkInAt.getMinutes() > 0);
  return late ? "late" : "present";
}

export class AttendanceService {
  constructor(private readonly repo: AttendanceRepository) {}

  async createCheckIn(input: AttendanceCreateCheckInInput): Promise<AttendanceRow> {
    const user = await this.repo.findActiveUserById(input.userId);
    if (!user) throw new Error("User not found or inactive");

    const attendanceDate = toDateOnlyUtc(input.attendanceDate);
    const existing = await this.repo.findAttendance(input.userId, attendanceDate);
    if (existing?.checkInAt) throw new Error("Duplicate check-in");

    const workday = await this.repo.findWorkday(attendanceDate);
    const isWorkday = workday ? workday.isWorkday : !isWeekend(attendanceDate);
    const attendanceStatus = deriveStatus(input.checkInAt, isWorkday);

    if (!existing) {
      return this.repo.createAttendance({
        userId: input.userId,
        attendanceDate,
        checkInAt: input.checkInAt,
        checkOutAt: null,
        attendanceStatus,
        source: input.source,
        notes: input.notes ?? null,
      });
    }

    return this.repo.updateAttendance(existing.id, {
      checkInAt: input.checkInAt,
      attendanceStatus,
      source: input.source,
      notes: input.notes ?? null,
    });
  }

  async createCheckOut(input: AttendanceCreateCheckOutInput): Promise<AttendanceRow> {
    const attendanceDate = toDateOnlyUtc(input.attendanceDate);
    const attendance = await this.repo.findAttendance(input.userId, attendanceDate);

    if (!attendance?.checkInAt) throw new Error("Check-in not found");
    if (input.checkOutAt < attendance.checkInAt) throw new Error("checkOutAt must be >= checkInAt");

    return this.repo.updateAttendance(attendance.id, {
      checkOutAt: input.checkOutAt,
      notes: input.notes ?? null,
    });
  }

  async listByEmployeePeriod(input: AttendanceListByPeriodInput): Promise<Paginated<AttendanceRow>> {
    if (input.endDate < input.startDate) throw new Error("endDate must be >= startDate");

    const skip = (input.page - 1) * input.pageSize;
    const [data, total] = await Promise.all([
      this.repo.listAttendanceByPeriod({
        userId: input.userId,
        startDate: toDateOnlyUtc(input.startDate),
        endDate: toDateOnlyUtc(input.endDate),
        skip,
        take: input.pageSize,
      }),
      this.repo.countAttendanceByPeriod({
        userId: input.userId,
        startDate: toDateOnlyUtc(input.startDate),
        endDate: toDateOnlyUtc(input.endDate),
      }),
    ]);

    return {
      data,
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
    };
  }

  async nightlyFinalizeStatus(input: AttendanceNightlyFinalizeInput): Promise<{ insertedAbsent: number; updatedLeave: number }> {
    const targetDate = toDateOnlyUtc(input.targetDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000));
    const workday = await this.repo.findWorkday(targetDate);
    const isWorkday = workday ? workday.isWorkday : !isWeekend(targetDate);

    const users = await this.repo.listActiveUsers();
    let insertedAbsent = 0;
    let updatedLeave = 0;

    for (const user of users) {
      const attendance = await this.repo.findAttendance(user.id, targetDate);
      const onLeave = await this.repo.hasApprovedLeaveOnDate(user.id, targetDate);

      if (!attendance && isWorkday && !onLeave) {
        await this.repo.createAttendance({
          userId: user.id,
          attendanceDate: targetDate,
          checkInAt: null,
          checkOutAt: null,
          attendanceStatus: "absent",
          source: null,
          notes: null,
        });
        insertedAbsent += 1;
      }

      if (attendance && onLeave && attendance.attendanceStatus !== "leave") {
        await this.repo.updateAttendance(attendance.id, { attendanceStatus: "leave" });
        updatedLeave += 1;
      }
    }

    return { insertedAbsent, updatedLeave };
  }
}
