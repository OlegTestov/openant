import { promises as fs } from 'fs';

export interface ServiceDomains {
  ghost: string;
  nocodb: string;
  n8n: string;
  wizard: string;
}

function getCaddyfilePath(): string {
  return process.env.CADDYFILE_PATH || '/app/Caddyfile';
}

export function generateCaddyfile(
  domains: ServiceDomains | null,
  _mode?: string,
  saas?: boolean,
): string {
  if (!domains) {
    return `:80 {
    reverse_proxy ghost:2368
}
`;
  }

  // In SaaS mode, Cloudflare terminates TLS; Caddy uses internal certs.
  const tls = saas ? '\n    tls internal' : '';

  const blocks: string[] = [];

  blocks.push(`${domains.ghost} {${tls}
    reverse_proxy ghost:2368
}`);

  blocks.push(`${domains.nocodb} {${tls}
    reverse_proxy nocodb:8080
}`);

  blocks.push(`${domains.n8n} {${tls}
    reverse_proxy n8n:5678
}`);

  blocks.push(`${domains.wizard} {${tls}
    reverse_proxy wizard:3000
}`);

  return blocks.join('\n\n') + '\n';
}

export async function writeCaddyfile(content: string): Promise<void> {
  await fs.writeFile(getCaddyfilePath(), content, 'utf-8');
}
