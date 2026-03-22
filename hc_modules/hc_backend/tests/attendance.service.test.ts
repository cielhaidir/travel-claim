import test from "node:test";
import assert from "node:assert/strict";
import { AttendanceService } from "../src/server/modules/hc/attendance/attendance.service";
import type { AttendanceRepository } from "../src/server/modules/hc/attendance/attendance.repository";
import type { AttendanceRow } from "../src/server/modules/hc/attendance/attendance.types";

function createRepo() {
  const rows: AttendanceRow[] = [];

  const repo: AttendanceRepository = {
    async findActiveUserById(userId) {
      return userId === "u-1" ? { id: userId } : null;
    },
    async findWorkday() {
      return { isWorkday: true };
    },
    async findAttendance(userId, attendanceDate) {
      return rows.find((r) => r.userId === userId && r.attendanceDate.toISOString() === attendanceDate.toISOString()) ?? null;
    },
    async createAttendance(input) {
      const row = { id: `att-${rows.length + 1}`, ...input };
      rows.push(row);
      return row;
    },
    async updateAttendance(id, patch) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error("Attendance not found");
      rows[idx] = { ...rows[idx], ...patch } as AttendanceRow;
      return rows[idx]!;
    },
    async listAttendanceByPeriod() {
      return rows;
    },
    async countAttendanceByPeriod() {
      return rows.length;
    },
    async listActiveUsers() {
      return [{ id: "u-1" }];
    },
    async hasApprovedLeaveOnDate() {
      return false;
    },
  };

  return { repo, rows };
}

test("attendance createCheckIn stores user-centric attendance", async () => {
  const { repo, rows } = createRepo();
  const service = new AttendanceService(repo);

  const result = await service.createCheckIn({
    userId: "u-1",
    attendanceDate: new Date("2026-03-17T00:00:00.000Z"),
    checkInAt: new Date("2026-03-17T00:55:00.000Z"),
    source: "web",
    notes: "on time",
  });

  assert.equal(result.userId, "u-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.attendanceStatus, "present");
});

test("attendance nightlyFinalizeStatus inserts absent record for active user", async () => {
  const { repo, rows } = createRepo();
  const service = new AttendanceService(repo);

  const result = await service.nightlyFinalizeStatus({
    targetDate: new Date("2026-03-18T00:00:00.000Z"),
  });

  assert.equal(result.insertedAbsent, 1);
  assert.equal(rows[0]?.userId, "u-1");
  assert.equal(rows[0]?.attendanceStatus, "absent");
});
