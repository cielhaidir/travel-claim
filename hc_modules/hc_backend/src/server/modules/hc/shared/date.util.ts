export function toDateOnlyUtc(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function enumerateDateRange(startDate: Date, endDate: Date): Date[] {
  const out: Date[] = [];
  const cur = toDateOnlyUtc(startDate);
  const end = toDateOnlyUtc(endDate);

  while (cur <= end) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return out;
}
