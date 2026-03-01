import dns from 'dns/promises';
import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';

export const domainSchema = z
  .object({
    use_domain: z.boolean(),
    domain: z.string().optional(),
    ghost_prefix: z.string().optional(),
    nocodb_prefix: z.string().optional(),
    n8n_prefix: z.string().optional(),
  })
  .refine((data) => !data.use_domain || (data.domain && data.domain.length > 0), {
    message: 'Domain is required when "I have a domain" is enabled',
  });

async function getServerIp(): Promise<string> {
  if (process.env.SERVER_IP) {
    return process.env.SERVER_IP;
  }

  try {
    const res = await fetch('https://ifconfig.me', {
      headers: { Accept: 'text/plain' },
    });
    return (await res.text()).trim();
  } catch {
    return 'unknown';
  }
}

async function checkDns(
  domain: string,
  serverIp: string,
): Promise<{ resolved: boolean; ip?: string; matches_server: boolean }> {
  try {
    const addresses = await dns.resolve4(domain);
    const ip = addresses[0];
    return {
      resolved: true,
      ip,
      matches_server: ip === serverIp,
    };
  } catch {
    return { resolved: false, matches_server: false };
  }
}

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = domainSchema.parse(await req.json());
    const state = await readState();

    state.domain = {
      use_domain: body.use_domain,
      domain: body.domain,
      ghost_prefix: body.ghost_prefix,
      nocodb_prefix: body.nocodb_prefix,
      n8n_prefix: body.n8n_prefix,
    };
    state.steps.domain = { completed: true };
    state.currentStep = 'llm';

    await writeState(state);

    const serverIp = await getServerIp();
    let dnsCheck: { resolved: boolean; ip?: string; matches_server: boolean } | undefined;

    if (body.use_domain && body.domain) {
      dnsCheck = await checkDns(body.domain, serverIp);
    }

    return Response.json({
      success: true,
      data: {
        server_ip: serverIp,
        dns_check: dnsCheck,
        current_domain: process.env.DOMAIN || null,
      },
    });
  }),
);
