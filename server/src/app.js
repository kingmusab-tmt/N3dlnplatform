import cors from 'cors';
import express from 'express';
import { createBuildingsRouter } from './routes/buildings.js';
import { createClaimsRouter } from './routes/claims.js';
import { createDocsRouter } from './routes/docs.js';
import { createNavigateRouter } from './routes/navigate.js';

export function createApp(db, { nipost = null, directions = null, claimLimit } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }));
  app.use(express.json({ limit: '10kb' }));

  app.get(['/health', '/api/v1/health'], (_req, res) => res.json({
      ok: true,
      nipost: nipost ? `level ${nipost.level}` : 'not configured',
      routing: directions ? 'mapbox' : 'not configured',
    }));
  app.use('/api/v1/navigate', createNavigateRouter(db, nipost, directions));
  app.use('/api/v1/buildings', createBuildingsRouter(db, { claimLimit }));
  app.use('/api/v1/claims', createClaimsRouter(db));
  app.use('/api/v1', createDocsRouter());

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
  });

  return app;
}
