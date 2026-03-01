export async function getServerIp(): Promise<string> {
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
