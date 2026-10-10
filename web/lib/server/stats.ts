import { formatPostcode } from '../postcode';
import type { Db } from './db';

export type LandingStats = { buildings: number | null; exampleCode: string };

const FALLBACK_EXAMPLE = 'FC02SIMBP87';

/**
 * Live figures for the landing page: how many buildings are mapped, and a
 * real example postcode (Silverbird Cinemas in the pilot area) that resolves
 * in this deployment's database. Never throws: the page renders with
 * fallbacks if the database is unreachable (e.g. during a CI build).
 */
export async function getLandingStats(db: Db): Promise<LandingStats> {
  try {
    const { rows } = await db.query(`
      SELECT (SELECT count(*) FROM buildings)::int AS buildings,
             (SELECT nipost_code FROM buildings
               WHERE metadata->>'name' = 'Silverbird Cinemas & Shopping Centre'
               ORDER BY nipost_code LIMIT 1) AS example
    `);
    return { buildings: rows[0].buildings, exampleCode: formatPostcode(rows[0].example ?? FALLBACK_EXAMPLE) };
  } catch {
    return { buildings: null, exampleCode: formatPostcode(FALLBACK_EXAMPLE) };
  }
}
