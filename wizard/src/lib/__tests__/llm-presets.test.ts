import { describe, it, expect } from 'vitest';
import { LLM_PRESETS } from '../llm-presets';

describe('LLM_PRESETS', () => {
  it('contains 4 presets', () => {
    expect(LLM_PRESETS).toHaveLength(4);
  });

  it('each preset has id, label, apiUrl, defaultModel', () => {
    for (const preset of LLM_PRESETS) {
      expect(preset.id).toBeTypeOf('string');
      expect(preset.label).toBeTypeOf('string');
      expect(preset).toHaveProperty('apiUrl');
      expect(preset).toHaveProperty('defaultModel');
    }
  });

  it('custom preset has empty apiUrl and defaultModel', () => {
    const custom = LLM_PRESETS.find((p) => p.id === 'custom');
    expect(custom).toBeDefined();
    expect(custom!.apiUrl).toBe('');
    expect(custom!.defaultModel).toBe('');
  });

  it('non-custom presets have non-empty apiUrl and defaultModel', () => {
    const nonCustom = LLM_PRESETS.filter((p) => p.id !== 'custom');
    for (const preset of nonCustom) {
      expect(preset.apiUrl.length).toBeGreaterThan(0);
      expect(preset.defaultModel.length).toBeGreaterThan(0);
    }
  });
});
