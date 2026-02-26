import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import type { SetupState } from '@/types/setup';

function getStatePath(): string {
  return process.env.STATE_PATH || '/app/data/state.json';
}

const setupStateSchema = z.object({
  currentStep: z.string(),
  deployed: z.boolean(),
  steps: z.record(z.string(), z.object({ completed: z.boolean() })),
  welcome: z
    .object({
      language: z.string(),
    })
    .optional(),
  domain: z
    .object({
      use_domain: z.boolean(),
      domain: z.string().optional(),
    })
    .optional(),
  llm: z
    .object({
      provider: z.string(),
      api_url: z.string(),
      api_key: z.string(),
      model: z.string(),
    })
    .optional(),
  blog: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      language: z.string(),
      tone: z.string(),
      publish_interval_minutes: z.number(),
    })
    .optional(),
  social: z
    .object({
      make_webhook_url: z.string().optional(),
      pinterest_enabled: z.boolean(),
      threads_enabled: z.boolean(),
    })
    .optional(),
});

const DEFAULT_STATE: SetupState = {
  currentStep: 'welcome',
  deployed: false,
  steps: {
    welcome: { completed: false },
    domain: { completed: false },
    llm: { completed: false },
    blog: { completed: false },
    social: { completed: false },
    review: { completed: false },
    deploy: { completed: false },
  },
};

export async function readState(): Promise<SetupState> {
  try {
    const content = await fs.readFile(getStatePath(), 'utf-8');
    const parsed = JSON.parse(content);
    return setupStateSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn('state.json is corrupted, returning default state');
    }
    // File not found or validation error — return default
    if (
      !(
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) &&
      !(error instanceof SyntaxError)
    ) {
      console.warn('state.json validation failed, returning default state');
    }
    return { ...DEFAULT_STATE, steps: { ...DEFAULT_STATE.steps } };
  }
}

export async function writeState(state: SetupState): Promise<void> {
  const dir = path.dirname(getStatePath());
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${getStatePath()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  await fs.rename(tmpPath, getStatePath());
}

export async function resetState(): Promise<void> {
  await writeState({ ...DEFAULT_STATE, steps: { ...DEFAULT_STATE.steps } });
}
