import dns from 'dns/promises';

export interface DnsCheckResult {
  domain: string;
  resolved: boolean;
  ip: string | null;
  matches_server: boolean;
  server_ip: string;
}

export async function checkDns(domain: string, serverIp: string): Promise<DnsCheckResult> {
  try {
    const ips = await dns.resolve4(domain);
    return {
      domain,
      resolved: true,
      ip: ips[0],
      matches_server: ips[0] === serverIp,
      server_ip: serverIp,
    };
  } catch {
    return {
      domain,
      resolved: false,
      ip: null,
      matches_server: false,
      server_ip: serverIp,
    };
  }
}
