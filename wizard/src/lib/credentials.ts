import crypto from 'crypto';

export interface ServiceCredential {
  email: string;
  password: string;
}

export interface ServiceCredentials {
  ghost: ServiceCredential;
  nocodb: ServiceCredential;
  n8n: ServiceCredential;
}

export function getServiceCredentials(setupToken: string, domain?: string): ServiceCredentials {
  const adminEmail = `admin@${domain || 'openant.local'}`;
  const token = setupToken || 'openant-default';

  return {
    ghost: {
      email: adminEmail,
      password:
        process.env.GHOST_ADMIN_PASSWORD ||
        crypto.createHash('sha256').update(`ghost-admin-${token}`).digest('hex').slice(0, 32),
    },
    nocodb: {
      email: adminEmail,
      password:
        process.env.NOCODB_ADMIN_PASSWORD ||
        crypto.createHash('sha256').update(`nocodb-admin-${token}`).digest('hex').slice(0, 32),
    },
    n8n: {
      email: adminEmail,
      password:
        process.env.N8N_ADMIN_PASSWORD ||
        `N${crypto.createHash('sha256').update(`n8n-admin-${token}`).digest('hex').slice(0, 20)}!`,
    },
  };
}
