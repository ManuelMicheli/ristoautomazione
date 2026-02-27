import type { VercelRequest, VercelResponse } from '@vercel/node';

let appPromise: ReturnType<typeof import('../packages/api/src/index')['buildApp']> | null = null;

async function getApp() {
  if (!appPromise) {
    const { buildApp } = await import('../packages/api/src/index');
    appPromise = buildApp();
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  await app.ready();
  app.server.emit('request', req, res);
}
