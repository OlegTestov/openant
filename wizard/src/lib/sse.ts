export function createSSEStream(): {
  stream: ReadableStream;
  controller: ReadableStreamDefaultController;
} {
  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  return { stream, controller };
}

export function sendSSEEvent(
  controller: ReadableStreamDefaultController,
  event: string,
  data: unknown,
): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(message));
}

export function closeSSE(controller: ReadableStreamDefaultController): void {
  controller.close();
}
