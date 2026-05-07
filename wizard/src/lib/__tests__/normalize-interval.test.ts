import { describe, it, expect } from 'vitest';
import {
  clampHoursToMinutes,
  clampMinutesToMinutes,
  minutesToHoursForDisplay,
  MIN_HOURS,
  MAX_HOURS,
  MIN_MINUTES,
  MAX_MINUTES,
} from '../normalize-interval';

describe('clampHoursToMinutes', () => {
  it.each([
    [1, 60],
    [6, 360],
    [24, 1440],
    [168, 10080],
  ])('keeps in-range integer hours: %i → %i min', (input, expected) => {
    expect(clampHoursToMinutes(input)).toBe(expected);
  });

  it.each([
    [0, 60],
    [-5, 60],
    [-Infinity, 60],
  ])('clamps below-min values to 1 hour: %s → %i', (input, expected) => {
    expect(clampHoursToMinutes(input)).toBe(expected);
  });

  it.each([
    [200, 10080],
    [99999, 10080],
    [Infinity, 10080],
  ])('clamps above-max values to 168 hours: %s → %i', (input, expected) => {
    expect(clampHoursToMinutes(input)).toBe(expected);
  });

  it('rounds half up for fractional hours: 1.5 → 120', () => {
    expect(clampHoursToMinutes(1.5)).toBe(120);
  });

  it('rounds 0.4 down to 0 then clamps: → 60', () => {
    expect(clampHoursToMinutes(0.4)).toBe(60);
  });

  it('falls back to MIN_HOURS for NaN', () => {
    expect(clampHoursToMinutes(NaN)).toBe(60);
  });
});

describe('clampMinutesToMinutes', () => {
  it.each([
    [60, 60],
    [360, 360],
    [10080, 10080],
  ])('keeps in-range hour-multiple values: %i → %i', (input, expected) => {
    expect(clampMinutesToMinutes(input)).toBe(expected);
  });

  it.each([
    [5, 60],
    [30, 60],
    [0, 60],
    [-100, 60],
  ])('clamps below-min minutes to 60: %i → %i', (input, expected) => {
    expect(clampMinutesToMinutes(input)).toBe(expected);
  });

  it.each([
    [99999, 10080],
    [10081, 10080],
    [Infinity, 10080],
  ])('clamps above-max minutes to 10080: %s → %i', (input, expected) => {
    expect(clampMinutesToMinutes(input)).toBe(expected);
  });

  it.each([
    [90, 120],
    [89, 60],
    [91, 120],
    [150, 180],
  ])('rounds non-multiple-of-60 to nearest hour: %i → %i', (input, expected) => {
    expect(clampMinutesToMinutes(input)).toBe(expected);
  });

  it('rounds 1.5 minutes down to 0, then clamps to 60', () => {
    expect(clampMinutesToMinutes(1.5)).toBe(60);
  });

  it('falls back to MIN_MINUTES for NaN', () => {
    expect(clampMinutesToMinutes(NaN)).toBe(60);
  });
});

describe('minutesToHoursForDisplay', () => {
  it.each([
    [60, 1],
    [360, 6],
    [10080, 168],
  ])('converts hour-multiple minutes to hours: %i → %i', (input, expected) => {
    expect(minutesToHoursForDisplay(input)).toBe(expected);
  });

  it.each([
    [30, 1],
    [89, 1],
    [90, 2],
    [150, 3],
  ])('rounds non-hour-multiple minutes to nearest hour: %i → %i', (input, expected) => {
    expect(minutesToHoursForDisplay(input)).toBe(expected);
  });

  it.each([
    [0, 1],
    [-100, 1],
    [undefined, 1],
    [null, 1],
    [NaN, 1],
  ])('returns MIN_HOURS for falsy / non-finite input: %s → %i', (input, expected) => {
    expect(minutesToHoursForDisplay(input as number | null | undefined)).toBe(expected);
  });

  it('clamps very large values to MAX_HOURS', () => {
    expect(minutesToHoursForDisplay(99999)).toBe(168);
  });
});

describe('constants', () => {
  it('exports the documented bounds', () => {
    expect(MIN_HOURS).toBe(1);
    expect(MAX_HOURS).toBe(168);
    expect(MIN_MINUTES).toBe(60);
    expect(MAX_MINUTES).toBe(10080);
  });
});
