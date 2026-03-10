import { describe, it, expect } from 'vitest';
import { STEPS } from '../steps';

describe('STEPS registry', () => {
  it('contains 8 steps', () => {
    expect(STEPS).toHaveLength(8);
  });

  it('first step is welcome', () => {
    expect(STEPS[0].id).toBe('welcome');
  });

  it('last step is deploy', () => {
    expect(STEPS[STEPS.length - 1].id).toBe('deploy');
  });

  it('telegram and social are the optional steps', () => {
    const optional = STEPS.filter((s) => !s.required);
    expect(optional).toHaveLength(2);
    expect(optional.map((s) => s.id)).toEqual(['telegram', 'social']);
  });

  it('every step has id, label, and required', () => {
    for (const step of STEPS) {
      expect(step.id).toBeTypeOf('string');
      expect(step.label).toBeTypeOf('string');
      expect(step.required).toBeTypeOf('boolean');
    }
  });
});
