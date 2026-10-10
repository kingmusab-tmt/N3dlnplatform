import 'dotenv/config';
import { createApp } from './app.js';
import { pool } from './db.js';
import { createDirectionsClient } from './lib/directions.js';
import { createNipostClient } from './lib/nipost.js';

const port = Number(process.env.PORT ?? 4000);

const nipost = process.env.NIPOST_API_KEY
  ? createNipostClient({
      apiKey: process.env.NIPOST_API_KEY,
      baseUrl: process.env.NIPOST_API_URL || undefined,
      level: Number(process.env.NIPOST_LOOKUP_LEVEL || 1),
    })
  : null;
if (!nipost) console.warn('NIPOST_API_KEY not set: postcodes will not be verified against NIPOST.');

const directions = process.env.MAPBOX_TOKEN ? createDirectionsClient({ accessToken: process.env.MAPBOX_TOKEN }) : null;
if (!directions) console.warn('MAPBOX_TOKEN not set: /navigate/:code/route is disabled.');

const app = createApp(pool, { nipost, directions });

const server = app.listen(port, () => {
  console.log(`NIPOST navigation API listening on http://localhost:${port}`);
  if (nipost) console.log(`NIPOST verification enabled (lookup level ${nipost.level})`);
});

const shutdown = () => {
  server.close(() => pool.end().finally(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
