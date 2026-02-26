import { promises as fs } from 'fs';

function getCaddyfilePath(): string {
  return process.env.CADDYFILE_PATH || '/app/Caddyfile';
}

export function generateCaddyfile(domain: string | null): string {
  if (!domain) {
    return `:80 {
    reverse_proxy ghost:2368
}
`;
  }

  return `${domain} {
    reverse_proxy ghost:2368
}

table.${domain} {
    reverse_proxy nocodb:8080
}

auto.${domain} {
    reverse_proxy n8n:5678
}

setup.${domain} {
    reverse_proxy wizard:3000
}
`;
}

export async function writeCaddyfile(content: string): Promise<void> {
  await fs.writeFile(getCaddyfilePath(), content, 'utf-8');
}
