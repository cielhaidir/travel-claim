import test from "node:test";
import assert from "node:assert/strict";
import { WorkdayService } from "../src/server/modules/hc/workday/workday.service";
import type { WorkdayRepository, WorkdayRow, WorkdayAttendanceRow } from "../src/server/modules/hc/workday/workday.repository";

function createRepo() {
  const workdays: WorkdayRow[] = [];
  const attendanceRows: WorkdayAttendanceRow[] = [];

  const repo: WorkdayRepository = {
    async bulkUpsert(items) {
      const created = items.map((item, idx) => ({ id: `wd-${idx + 1}`, ...item }));
      workdays.push(...created);
      return created;
    },
    async list() {
      return workdays;
    },
    async count() {
      return workdays.length;
    },
    async listWorkdaysInRange() {
      return workdays;
    },
    async listAttendanceInRange() {
      return attendanceRows;
    },
    async updateAttendanceStatus(id, attendanceStatus) {
      const row = attendanceRows.find((r) => r.id === id);
      if (row) row.attendanceStatus = attendanceStatus;
    },
  };

  return { repo, workdays, attendanceRows };
}

test("workday bulkUpsert rejects duplicate dates in payload", async () => {
  const { repo } = createRepo();
  const service = new WorkdayService(repo);

  await assert.rejects(() =>
    service.bulkUpsert({
      items: [
        { workDate: new Date("2026-03-17T00:00:00.000Z"), isWorkday: true, workType: "regular", description: "A" },
        { workDate: new Date("2026-03-17T12:00:00.000Z"), isWorkday: true, workType: "regular", description: "B" },
      ],
    }),
  );
});

test("workday syncImpactedAttendance converts absent to holiday on non-workday", async () => {
  const { repo, workdays, attendanceRows } = createRepo();
  const service = new WorkdayService(repo);

  workdays.push({
    id: "wd-1",
    workDate: new Date("2026-03-22T00:00:00.000Z"),
    isWorkday: false,
    workType: "weekend",
    description: "Sunday",
  });

  attendanceRows.push({
    id: "att-1",
    userId: "u-1",
    attendanceDate: new Date("2026-03-22T00:00:00.000Z"),
    attendanceStatus: "absent",
    checkInAt: null,
    checkOutAt: null,
  });

  const result = await service.syncImpactedAttendance({
    startDate: new Date("2026-03-22T00:00:00.000Z"),
    endDate: new Date("2026-03-22T00:00:00.000Z"),
  });

  assert.equal(result.updated, 1);
  assert.equal(attendanceRows[0]?.attendanceStatus, "holiday");
});

test("workday syncImpactedAttendance converts holiday back to absent on workday without checkin", async () => {
  const { repo, workdays, attendanceRows } = createRepo();
  const service = new WorkdayService(repo);

  workdays.push({
    id: "wd-2",
    workDate: new Date("2026-03-24T00:00:00.000Z"),
    isWorkday: true,
    workType: "regular",
    description: "Tuesday",
  });

  attendanceRows.push({
    id: "att-2",
    userId: "u-1",
    attendanceDate: new Date("2026-03-24T00:00:00.000Z"),
    attendanceStatus: "holiday",
    checkInAt: null,
    checkOutAt: null,
  });

  const result = await service.syncImpactedAttendance({
    startDate: new Date("2026-03-24T00:00:00.000Z"),
    endDate: new Date("2026-03-24T00:00:00.000Z"),
  });

  assert.equal(result.updated, 1);
  assert.equal(attendanceRows[0]?.attendanceStatus, "absent");
});
