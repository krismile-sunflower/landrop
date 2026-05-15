import { networkInterfaces } from 'node:os';

export function getLanIp() {
  const interfaces = networkInterfaces();
  const candidates: string[] = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        candidates.push(entry.address);
      }
    }
  }

  return (
    candidates.find((address) => address.startsWith('192.168.')) ??
    candidates.find((address) => address.startsWith('10.')) ??
    candidates.find((address) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) ??
    candidates[0] ??
    '127.0.0.1'
  );
}

export function getServerUrl(port: number) {
  return process.env.LANDROP_PUBLIC_URL ?? `http://${getLanIp()}:${port}`;
}
