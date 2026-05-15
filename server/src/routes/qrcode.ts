import type { Context } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import QRCode from 'qrcode';
import { getServerUrl } from '../utils/ip.js';

type AppContext = Context<{ Bindings: HttpBindings }>;

export function createQrCodeHandler(port: number) {
  return async (c: AppContext) => {
    const url = c.req.query('url') ?? getServerUrl(port);
    const qrcode = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320
    });

    return c.json({ url, qrcode });
  };
}
