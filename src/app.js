import express from 'express';
import { validDestination } from './storage.js';

function errorResponse(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}
function storageError(res) {
  return errorResponse(res, 503, 'STORAGE_UNAVAILABLE', 'Link storage is unavailable.');
}

export function createApp({ storage, publicLinkOrigin }) {
  const app = express();
  app.disable('x-powered-by');
  app.post('/api/links', express.json(), async (req, res) => {
    if (!validDestination(req.body?.destinationUrl)) {
      return errorResponse(res, 400, 'INVALID_INPUT', 'destinationUrl must be an absolute HTTP(S) URL.');
    }
    try {
      const code = await storage.create(req.body.destinationUrl);
      res.status(201).json({ shortUrl: `${publicLinkOrigin}/s/${code}` });
    } catch { storageError(res); }
  });
  app.get('/s/:code', async (req, res) => {
    try {
      const destination = await storage.lookup(req.params.code);
      if (destination === undefined) return errorResponse(res, 404, 'NOT_FOUND', 'Short link not found.');
      res.set('Location', destination).status(302).end();
    } catch { storageError(res); }
  });
  app.get('/health', async (_req, res) => {
    try { await storage.read(); res.status(200).end(); }
    catch { storageError(res); }
  });
  app.use((error, _req, res, _next) => {
    if (error.status >= 400 && error.status < 500) {
      return errorResponse(res, 400, 'INVALID_INPUT', 'A valid JSON request is required.');
    }
    errorResponse(res, 500, 'INTERNAL_ERROR', 'Request could not be processed.');
  });
  return app;
}
