export const SEAT_CLASS_VALUES = ["Economy", "Business"] as const;

export type SeatClass = (typeof SEAT_CLASS_VALUES)[number];

export const KELAS_TRANSPORT_MODES = ["FLIGHT", "TRAIN", "FERRY"] as const;

export function transportModeUsesSeatClassEnum(mode?: string): boolean {
  return !!mode && (KELAS_TRANSPORT_MODES as readonly string[]).includes(mode);
}

export function normalizeSeatClass(
  mode: string | undefined,
  seatClass: string | null | undefined,
): string | undefined {
  const value = seatClass?.trim();

  if (!value) {
    return undefined;
  }

  if (transportModeUsesSeatClassEnum(mode)) {
    return (SEAT_CLASS_VALUES as readonly string[]).includes(value)
      ? value
      : undefined;
  }

  return value;
}
