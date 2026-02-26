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
    redirect(`/dashboard${query}`);
  }

  redirect(`/setup${query}`);
}
