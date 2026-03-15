export interface LlmTestResult {
  connected: boolean;
  model_response?: string;
  latency_ms?: number;
  error?: string;
}

export interface TelegramTestResult {
  connected: boolean;
  bot_name?: string;
  error?: string;
}

export interface WebhookTestResult {
  connected: boolean;
  error?: string;
}

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Request timeout';
  }
  return error instanceof Error ? `Connection failed: ${error.message}` : 'Connection failed';
}

export async function testLlmConnection(
  apiUrl: string,
  apiKey: string,
  model: string,
): Promise<LlmTestResult> {
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
      signal: AbortSignal.timeout(10000),
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
    return { connected: false, error: formatError(error) };
  }
}

export async function testTelegramToken(botToken: string): Promise<TelegramTestResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();

    if (data.ok) {
      return { connected: true, bot_name: `@${data.result.username}` };
    }
    return { connected: false, error: data.description || 'Invalid token' };
  } catch (error) {
    return { connected: false, error: formatError(error) };
  }
}

export async function testWebhook(url: string): Promise<WebhookTestResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, source: 'openant-wizard' }),
      signal: AbortSignal.timeout(10000),
    });

    // Make.com returns 400 for payloads that don't match the scenario's expected structure,
    // but that's fine — the webhook URL is correct and listening.
    // 404 means the webhook URL doesn't exist. 5xx means server error.
    if (res.ok || res.status === 400) {
      return { connected: true };
    }
    return { connected: false, error: `Webhook returned ${res.status}` };
  } catch (error) {
    return { connected: false, error: formatError(error) };
  }
}
