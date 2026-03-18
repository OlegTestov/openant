export async function GET() {
  return Response.json({
    success: true,
    data: {
      instance_mode: process.env.INSTANCE_MODE || 'byok',
    },
  });
}
