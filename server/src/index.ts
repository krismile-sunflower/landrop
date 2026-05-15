import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getRequestListener, type HttpBindings } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createQrCodeHandler } from './routes/qrcode.js';
import { downloadHandler } from './routes/download.js';
import { uploadHandler } from './routes/upload.js';
import { startUploadCleanup } from './utils/cleanup.js';
import { ensureUploadsDir } from './utils/files.js';
import { getLanIp, getServerUrl } from './utils/ip.js';
import { attachWebSocketServer } from './ws/handler.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const publicRoot = process.env.LANDROP_PUBLIC_DIR
  ? path.resolve(process.env.LANDROP_PUBLIC_DIR)
  : path.resolve(process.cwd(), '../client/out');

const app = new Hono<{ Bindings: HttpBindings }>();

app.get('/api/health', (c) => c.json({ ok: true }));
app.post('/api/upload', uploadHandler);
app.get('/api/download/:fileId', downloadHandler);
app.get('/api/qrcode', createQrCodeHandler(port));

app.use('/_next/*', serveStatic({ root: publicRoot }));
app.get('/favicon.ico', serveStatic({ root: publicRoot }));
app.get('/robots.txt', serveStatic({ root: publicRoot }));
app.get('/manifest.webmanifest', serveStatic({ root: publicRoot }));
app.get(
  '*',
  serveStatic({
    root: publicRoot,
    rewriteRequestPath: (requestPath) => (requestPath === '/' ? '/index.html' : requestPath)
  })
);

function openBrowser(url: string) {
  if (process.env.LANDROP_OPEN_BROWSER === 'false') {
    return;
  }

  const command =
    process.platform === 'win32'
      ? { file: 'cmd', args: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { file: 'open', args: [url] }
        : { file: 'xdg-open', args: [url] };

  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  child.unref();
}

await ensureUploadsDir();
startUploadCleanup();

const server = createServer(getRequestListener(app.fetch));
attachWebSocketServer(server);

server.listen(port, host, () => {
  const url = getServerUrl(port);

  if (!existsSync(publicRoot)) {
    console.warn(`Static client not found: ${publicRoot}`);
    console.warn('Run npm run build before npm start.');
  }

  console.log(`LAN IP: ${getLanIp()}`);
  console.log(`Open: ${url}`);
  openBrowser(url);
});
