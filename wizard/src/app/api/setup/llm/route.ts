import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';

export const llmSchema = z.object({
  provider: z.string(),
  api_url: z.string().url(),
  api_key: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required'),
});

interface TestResult {
  connected: boolean;
  model_response?: string;
  latency_ms?: number;
  error?: string;
}

async function testLlmConnection(
  apiUrl: string,
  apiKey: string,
  model: string,
): Promise<TestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const start = performance.now();

    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      return {
        connected: false,
        error: `Invalid API key or configuration (${res.status})`,
      };
    }

    const data = await res.json();
    const modelResponse = data.choices?.[0]?.message?.content ?? '';

    return {
      connected: true,
      model_response: modelResponse,
      latency_ms: latencyMs,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { connected: false, error: 'Request timeout' };
    }
    return {
      connected: false,
      error: error instanceof Error ? `Connection failed: ${error.message}` : 'Connection failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = llmSchema.parse(await req.json());
    const state = await readState();

    // Preserve existing API key if masked placeholder submitted
    if (body.api_key === '***' && state.llm?.api_key) {
      body.api_key = state.llm.api_key;
    }

    state.llm = body;
    state.steps.llm = { completed: true };
    state.currentStep = 'blog';

    await writeState(state);

    const testResult = await testLlmConnection(body.api_url, body.api_key, body.model);

    return Response.json({
      success: true,
      data: { test_result: testResult },
    });
  }),
);
