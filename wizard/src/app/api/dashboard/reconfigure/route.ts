import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';

export const POST = withAuth(
  apiHandler(async () => {
    const state = await readState();

    state.steps.deploy = { completed: false };
    state.steps.review = { completed: false };
    state.currentStep = 'review';

    await writeState(state);

    return Response.json({ success: true });
  }),
);
