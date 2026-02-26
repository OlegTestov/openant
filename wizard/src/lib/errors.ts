export class AdapterError extends Error {
  constructor(
    public readonly adapter: string,
    public readonly operation: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${adapter}] ${operation}: ${message}`);
    this.name = 'AdapterError';
  }
}
