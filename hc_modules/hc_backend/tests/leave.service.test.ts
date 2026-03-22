import test from "node:test";
import assert from "node:assert/strict";
import { LeaveService } from "../src/server/modules/hc/leave/leave.service";
import type { LeaveRepository, LeaveRequestRow } from "../src/server/modules/hc/leave/leave.repository";

function createRepo() {
  const rows: LeaveRequestRow[] = [];
  const attendanceLeave: Array<{ userId: string; date: string }> = [];

  const repo: LeaveRepository = {
    async findActiveUserById(userId) {
      return userId === "u-1" ? { id: userId } : null;
    },
    async findById(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async listWorkdays(startDate, endDate) {
      return [
        { workDate: startDate, isWorkday: true },
        { workDate: endDate, isWorkday: true },
      ];
    },
    async listConflicts() {
      return [];
    },
    async sumApprovedAnnualLeave() {
      return 0;
    },
    async create(input) {
      rows.push(input);
      return input;
    },
    async update(id, patch) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error("Request not found");
      rows[idx] = { ...rows[idx], ...patch } as LeaveRequestRow;
      return rows[idx]!;
    },
    async upsertAttendanceLeave(userId, date) {
      attendanceLeave.push({ userId, date: date.toISOString().slice(0, 10) });
    },
    async list() {
      return rows;
    },
    async count() {
      return rows.length;
    },
    async createApprovalLog() {
      return;
    },
  };

  return { repo, rows, attendanceLeave };
}

test("leave submit creates user-centric leave request", async () => {
  const { repo, rows } = createRepo();
  const service = new LeaveService(repo);

  const result = await service.submit({
    userId: "u-1",
    leaveType: "annual",
    startDate: new Date("2026-03-18T00:00:00.000Z"),
    endDate: new Date("2026-03-18T00:00:00.000Z"),
    reason: "Personal leave",
  });

  assert.equal(result.userId, "u-1");
  assert.equal(rows[0]?.status, "submitted");
});

test("leave approve syncs attendance for approved leave dates", async () => {
  const { repo, rows, attendanceLeave } = createRepo();
  const service = new LeaveService(repo);

  rows.push({
    id: "lv-1",
    requestNo: "LV-1",
    userId: "u-1",
    leaveType: "annual",
    startDate: new Date("2026-03-18T00:00:00.000Z"),
    endDate: new Date("2026-03-19T00:00:00.000Z"),
    totalDays: 2,
    reason: "Annual leave",
    status: "submitted",
    approvedByUserId: null,
    approvedAt: null,
    rejectionReason: null,
  });

  const result = await service.approve({
    requestId: "lv-1",
    approverId: "mgr-1",
    notes: "approved",
  });

  assert.equal(result.status, "approved");
  assert.equal(attendanceLeave.length, 2);
  assert.equal(attendanceLeave[0]?.userId, "u-1");
});
