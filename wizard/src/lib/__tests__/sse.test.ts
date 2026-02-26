import { describe, it, expect } from 'vitest';
import { createSSEStream, sendSSEEvent, closeSSE } from '../sse';

describe('createSSEStream', () => {
  it('returns a ReadableStream and controller', () => {
    const { stream, controller } = createSSEStream();

    expect(stream).toBeInstanceOf(ReadableStream);
    expect(controller).toBeDefined();
    expect(typeof controller.enqueue).toBe('function');
    expect(typeof controller.close).toBe('function');

    controller.close();
  });
});

describe('sendSSEEvent', () => {
  it('enqueues correctly formatted SSE message', async () => {
    const { stream, controller } = createSSEStream();
    const reader = stream.getReader();

    sendSSEEvent(controller, 'step', { step: 1, status: 'running' });
    controller.close();

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toBe('event: step\ndata: {"step":1,"status":"running"}\n\n');
  });

  it('serializes complex data as JSON', async () => {
    const { stream, controller } = createSSEStream();
    const reader = stream.getReader();

    const data = { nested: { key: 'value' }, array: [1, 2, 3] };
    sendSSEEvent(controller, 'test', data);
    controller.close();

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain(`data: ${JSON.stringify(data)}`);
  });
});

describe('closeSSE', () => {
  it('closes the stream', async () => {
    const { stream, controller } = createSSEStream();
    const reader = stream.getReader();

    closeSSE(controller);

    const { done } = await reader.read();
    expect(done).toBe(true);
  });
});
