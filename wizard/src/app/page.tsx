import { redirect } from 'next/navigation';
import { readState } from '@/lib/state';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = await readState();
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : undefined;
  const query = token ? `?token=${encodeURIComponent(token)}` : '';

  if (state.deployed) {
    if (process.env.OPENANT_SAAS_MODE === 'true') {
      const saasUrl = process.env.OPENANT_SAAS_URL || 'https://openant.app';
      redirect(`${saasUrl}/dashboard`);
    }
    redirect(`/dashboard${query}`);
  }

  redirect(`/setup${query}`);
}
