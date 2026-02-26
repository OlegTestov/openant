import { z } from 'zod';
import { AdapterError } from '@/lib/errors';

type RouteHandler = (req: Request) => Promise<Response>;

export function apiHandler(handler: RouteHandler): RouteHandler {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json(
          {
            success: false,
            error: error.issues[0].message,
            code: 'VALIDATION_ERROR',
          },
          { status: 400 },
        );
      }

      if (error instanceof AdapterError) {
        console.error(`AdapterError: ${error.message}`, error.cause);
        return Response.json(
          {
            success: false,
            error: error.message,
            code: 'ADAPTER_ERROR',
          },
          { status: 500 },
        );
      }

      console.error('Unexpected error:', error);
      return Response.json(
        {
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
        { status: 500 },
      );
    }
  };
}
