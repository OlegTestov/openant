type RouteHandler = (req: Request) => Promise<Response>;

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (req: Request) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice('Bearer '.length);

    if (!token || token !== process.env.SETUP_TOKEN) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    return handler(req);
  };
}
