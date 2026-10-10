import cors from 'cors';
import express from 'express';
import { createNavigateRouter } from './routes/navigate.js';

export function createApp(db, { nipost = null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, nipost: nipost ? `level ${nipost.level}` : 'not configured' }));
  app.use('/api/v1/navigate', createNavigateRouter(db, nipost));

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
  });

  return app;
}
