export type WorkdayRow = {
  id: string;
  workDate: Date;
  isWorkday: boolean;
  workType: "regular" | "weekend" | "holiday" | "collective_leave";
  description: string | null;
};

export type WorkdayAttendanceRow = {
  id: string;
  userId: string;
  attendanceDate: Date;
  attendanceStatus: "present" | "late" | "absent" | "leave" | "holiday" | "sick" | "remote";
  checkInAt: Date | null;
  checkOutAt: Date | null;
};

export type WorkdayRepository = {
  bulkUpsert(items: Array<Omit<WorkdayRow, "id">>): Promise<WorkdayRow[]>;
  list(input: {
    startDate: Date;
    endDate: Date;
    isWorkday?: boolean;
    skip: number;
    take: number;
  }): Promise<WorkdayRow[]>;
  count(input: { startDate: Date; endDate: Date; isWorkday?: boolean }): Promise<number>;
  listWorkdaysInRange(startDate: Date, endDate: Date): Promise<WorkdayRow[]>;
  listAttendanceInRange(startDate: Date, endDate: Date): Promise<WorkdayAttendanceRow[]>;
  updateAttendanceStatus(id: string, attendanceStatus: WorkdayAttendanceRow["attendanceStatus"]): Promise<void>;
};
