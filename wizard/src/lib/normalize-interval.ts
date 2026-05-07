export const MIN_HOURS = 1;
export const MAX_HOURS = 168;

export const MIN_MINUTES = MIN_HOURS * 60;
export const MAX_MINUTES = MAX_HOURS * 60;

function safeNumber(v: number, fallback: number): number {
  if (Number.isNaN(v)) return fallback;
  if (v === Infinity) return Number.MAX_SAFE_INTEGER;
  if (v === -Infinity) return Number.MIN_SAFE_INTEGER;
  return v;
}

export function clampHoursToMinutes(rawHours: number): number {
  const hours = Math.round(safeNumber(rawHours, MIN_HOURS));
  const clamped = Math.max(MIN_HOURS, Math.min(MAX_HOURS, hours));
  return clamped * 60;
}

export function clampMinutesToMinutes(rawMinutes: number): number {
  const minutes = safeNumber(rawMinutes, MIN_MINUTES);
  const rounded = Math.round(minutes / 60) * 60;
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, rounded));
}

export function minutesToHoursForDisplay(minutes: number | undefined | null): number {
  if (typeof minutes !== 'number') return MIN_HOURS;
  if (Number.isNaN(minutes)) return MIN_HOURS;
  const safe = minutes === Infinity ? MAX_MINUTES : minutes === -Infinity ? MIN_MINUTES : minutes;
  return Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.round(safe / 60)));
}
