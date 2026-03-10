import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { readState, writeState, resetState } from '../state';

let tmpDir: string;
let statePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'state-test-'));
  statePath = path.join(tmpDir, 'state.json');
  vi.stubEnv('STATE_PATH', statePath);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('readState', () => {
  it('returns default state when file does not exist', async () => {
    const state = await readState();
    expect(state.currentStep).toBe('welcome');
    expect(state.deployed).toBe(false);
    expect(state.steps.welcome).toEqual({ completed: false });
    expect(state.steps.deploy).toEqual({ completed: false });
  });

  it('reads and parses existing state.json', async () => {
    const testState = {
      currentStep: 'blog',
      deployed: false,
      steps: {
        welcome: { completed: true },
        domain: { completed: true },
        llm: { completed: false },
        blog: { completed: false },
        social: { completed: false },
        review: { completed: false },
        deploy: { completed: false },
      },
    };
    await fs.writeFile(statePath, JSON.stringify(testState), 'utf-8');

    const state = await readState();
    expect(state.currentStep).toBe('blog');
    expect(state.steps.welcome.completed).toBe(true);
    expect(state.steps.domain.completed).toBe(true);
  });

  it('returns default state when file is corrupted JSON', async () => {
    await fs.writeFile(statePath, '{corrupted json!!!', 'utf-8');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const state = await readState();
    expect(state.currentStep).toBe('welcome');
    expect(state.deployed).toBe(false);

    warnSpy.mockRestore();
  });

  it('returns default state when file fails zod validation', async () => {
    await fs.writeFile(statePath, JSON.stringify({ invalid: true }), 'utf-8');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const state = await readState();
    expect(state.currentStep).toBe('welcome');
    expect(state.deployed).toBe(false);

    warnSpy.mockRestore();
  });
});

describe('writeState', () => {
  it('writes state to file', async () => {
    const state = {
      currentStep: 'llm',
      deployed: false,
      steps: {
        welcome: { completed: true },
        domain: { completed: true },
        llm: { completed: false },
        blog: { completed: false },
        social: { completed: false },
        review: { completed: false },
        deploy: { completed: false },
      },
    };

    await writeState(state);

    const content = await fs.readFile(statePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.currentStep).toBe('llm');
  });

  it('round-trip: writeState → readState returns identical data', async () => {
    const state = {
      currentStep: 'blog',
      deployed: false,
      steps: {
        welcome: { completed: true },
        domain: { completed: true },
        llm: { completed: true },
        blog: { completed: false },
        social: { completed: false },
        review: { completed: false },
        deploy: { completed: false },
      },
      llm: {
        provider: 'openai',
        api_url: 'https://api.openai.com/v1',
        api_key: 'sk-test',
        model: 'gpt-4o-mini',
      },
    };

    await writeState(state);
    const result = await readState();

    expect(result.currentStep).toBe(state.currentStep);
    expect(result.deployed).toBe(state.deployed);
    expect(result.steps).toEqual(state.steps);
    expect(result.llm).toEqual(state.llm);
  });

  it('performs atomic write (temp file does not remain)', async () => {
    await writeState({
      currentStep: 'welcome',
      deployed: false,
      steps: { welcome: { completed: false } },
    });

    const tmpPath = `${statePath}.tmp`;
    await expect(fs.access(tmpPath)).rejects.toThrow();
    await expect(fs.access(statePath)).resolves.toBeUndefined();
  });
});

describe('resetState', () => {
  it('resets to DEFAULT_STATE', async () => {
    await writeState({
      currentStep: 'deploy',
      deployed: true,
      steps: { welcome: { completed: true } },
    });

    await resetState();
    const state = await readState();

    expect(state.currentStep).toBe('welcome');
    expect(state.deployed).toBe(false);
    expect(Object.keys(state.steps)).toHaveLength(8);
  });
});
