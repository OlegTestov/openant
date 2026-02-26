import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState } from '@/lib/state';

export const GET = withAuth(
  apiHandler(async () => {
    const state = await readState();

    return Response.json({
      success: true,
      data: {
        deployed: state.deployed,
        currentStep: state.currentStep,
        steps: state.steps,
        welcome: state.welcome,
        domain: state.domain,
        llm: state.llm ? { ...state.llm, api_key: '***' } : undefined,
        blog: state.blog,
        social: state.social,
        saas_mode: process.env.OPENANT_SAAS_MODE === 'true',
      },
    });
  }),
);
