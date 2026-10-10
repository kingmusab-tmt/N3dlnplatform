// Dispatch runs: a rider's trip with ordered stops, live position for
// customers' tracking pages, and proof of delivery at each stop.
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { formatPostcode, normalizePostcode } from '../postcode';
import { BUILDING_COLUMNS, buildingBody, type BuildingRow } from './buildings';
import { isUuid } from './claims';
import type { Db } from './db';
import { MAX_OPTIMIZED_STOPS, PROFILES, type DirectionsClient, type LngLat, type Profile } from './directions';
import { isLngLat } from './http';
import { destinationFor, type Destination } from './navigate';

export const MAX_STOPS = 25;
export const PHOTO_MAX_BYTES = 1_572_864; // 1.5 MB, matches the delivery_photos CHECK
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class RunError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---- Rider tokens --------------------------------------------------------------

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newRiderToken = () => `n3d_rider_${randomBytes(24).toString('base64url')}`;

/** The run if `token` is its rider token, else null. */
export async function authorizeRun(db: Db, runId: string, token: string | null) {
  if (!token || !isUuid(runId)) return null;
  const { rows } = await db.query(
    'SELECT id, status, profile FROM delivery_runs WHERE id = $1 AND rider_token_hash = $2',
    [runId, hashToken(token)],
  );
  return rows[0] ?? null;
}

// ---- Creating a run ------------------------------------------------------------

export type StopInput = {
  code: string;
  /** Share id of a claim on this building: routes to the owner's gate. */
  claim?: string;
  recipient_name?: string;
  /** A 4-digit code the partner gave the customer. */
  pod_code?: string;
  /** Generate a 4-digit code (returned only in this response). */
  require_code?: boolean;
};

type ParsedStop = { code: string; claim: string | null; recipient: string | null; podCode: string | null };

export function parseRunInput(body: any): { profile: Profile; stops: ParsedStop[]; optimize: boolean; from: LngLat | null } {
  const profile = (body?.profile ?? 'driving') as Profile;
  if (!PROFILES.includes(profile)) throw new RunError(400, 'INVALID_PROFILE', `profile must be one of: ${PROFILES.join(', ')}.`);

  const raw = body?.stops;
  if (!Array.isArray(raw) || raw.length === 0) throw new RunError(400, 'INVALID_RUN', 'stops must be a non-empty array.');
  if (raw.length > MAX_STOPS) throw new RunError(400, 'INVALID_RUN', `A run can have at most ${MAX_STOPS} stops.`);

  const stops = raw.map((s: StopInput, i: number): ParsedStop => {
    const code = normalizePostcode(s?.code);
    if (!code) throw new RunError(400, 'INVALID_POSTCODE', `Stop ${i + 1}: expected an 11-character NIPOST code.`);
    if (s.claim != null && !isUuid(String(s.claim))) throw new RunError(400, 'INVALID_RUN', `Stop ${i + 1}: claim must be a share id.`);
    if (s.pod_code != null && !/^\d{4}$/.test(String(s.pod_code))) {
      throw new RunError(400, 'INVALID_RUN', `Stop ${i + 1}: pod_code must be 4 digits.`);
    }
    const recipient = typeof s.recipient_name === 'string' ? s.recipient_name.trim().slice(0, 80) || null : null;
    const podCode = s.pod_code != null ? String(s.pod_code) : s.require_code ? String(randomInt(0, 10_000)).padStart(4, '0') : null;
    return { code, claim: s.claim ?? null, recipient, podCode };
  });

  const optimize = body?.optimize === true;
  let from: LngLat | null = null;
  if (body?.from != null) {
    const f = Array.isArray(body.from) ? body.from.map(Number) : [];
    if (!isLngLat(f[0], f[1])) throw new RunError(400, 'INVALID_ORIGIN', 'from must be [lng, lat].');
    from = [f[0], f[1]];
  }
  if (optimize && !from) throw new RunError(400, 'INVALID_ORIGIN', 'optimize needs the rider position in from.');
  if (optimize && stops.length > MAX_OPTIMIZED_STOPS) {
    throw new RunError(400, 'TOO_MANY_STOPS', `Route optimisation supports up to ${MAX_OPTIMIZED_STOPS} stops.`);
  }
  return { profile, stops, optimize, from };
}

const BUILDINGS_BY_CODE_SQL = `SELECT ${BUILDING_COLUMNS} FROM buildings WHERE nipost_code = ANY($1)`;
const CLAIM_GATES_SQL = `
  SELECT c.share_token, c.id, b.nipost_code, ST_X(c.gate) AS lng, ST_Y(c.gate) AS lat
  FROM claims c JOIN buildings b ON b.id = c.building_id
  WHERE c.share_token = ANY($1::uuid[]) AND c.status <> 'rejected'
`;
const INSERT_RUN_SQL = `
  INSERT INTO delivery_runs (id, rider_token_hash, created_by_key_id, created_by_user_id, profile)
  VALUES ($1, $2, $3, $4, $5)
`;
const INSERT_DELIVERIES_SQL = `
  INSERT INTO deliveries (run_id, stop_index, building_id, claim_id, recipient_name, pod_code)
  SELECT $1, d.stop_index, d.building_id, d.claim_id, d.recipient_name, d.pod_code
  FROM jsonb_to_recordset($2::jsonb)
    AS d(stop_index int, building_id bigint, claim_id uuid, recipient_name text, pod_code text)
  RETURNING id, stop_index, tracking_token
`;

export async function createRun(
  db: Db,
  directions: DirectionsClient | null,
  input: ReturnType<typeof parseRunInput>,
  owner: { keyId: number | null; userId: string | null },
  origin: string,
) {
  const codes = [...new Set(input.stops.map((s) => s.code))];
  const { rows: buildingRows } = await db.query(BUILDINGS_BY_CODE_SQL, [codes]);
  const buildings = new Map<string, BuildingRow>(buildingRows.map((r: BuildingRow) => [r.nipost_code, r]));
  const missing = codes.filter((c) => !buildings.has(c));
  if (missing.length) {
    throw new RunError(404, 'POSTCODE_NOT_FOUND', `No building is registered for ${missing.map(formatPostcode).join(', ')}.`);
  }

  const shareIds = input.stops.flatMap((s) => (s.claim ? [s.claim] : []));
  const claimGates = new Map<string, { id: string; code: string; point: LngLat | null }>();
  if (shareIds.length) {
    const { rows } = await db.query(CLAIM_GATES_SQL, [shareIds]);
    for (const r of rows) claimGates.set(r.share_token, { id: r.id, code: r.nipost_code, point: r.lng == null ? null : [r.lng, r.lat] });
  }

  let stops = input.stops.map((s) => {
    const building = buildings.get(s.code)!;
    const claim = s.claim ? claimGates.get(s.claim) : undefined;
    // A claim only applies to its own building.
    const ownClaim = claim && claim.code === s.code ? claim : undefined;
    const destination: Destination = ownClaim?.point
      ? { point: ownClaim.point, kind: 'gate', source: 'claim' }
      : destinationFor(building);
    return { ...s, building, claimId: ownClaim?.id ?? null, destination };
  });

  if (input.optimize && input.from && stops.length >= 2) {
    if (!directions) throw new RunError(503, 'ROUTING_NOT_CONFIGURED', 'Routing is not configured on this server.');
    const order = await directions.optimizeOrder(input.from, stops.map((s) => s.destination.point), input.profile);
    stops = order.map((i) => stops[i]);
  }

  const runId = randomUUID();
  const riderToken = newRiderToken();
  await db.query(INSERT_RUN_SQL, [runId, hashToken(riderToken), owner.keyId, owner.userId, input.profile]);
  let inserted: { id: string; stop_index: number; tracking_token: string }[];
  try {
    const payload = stops.map((s, i) => ({
      stop_index: i,
      building_id: s.building.id,
      claim_id: s.claimId,
      recipient_name: s.recipient,
      pod_code: s.podCode,
    }));
    ({ rows: inserted } = await db.query(INSERT_DELIVERIES_SQL, [runId, JSON.stringify(payload)]));
  } catch (err) {
    await db.query('DELETE FROM delivery_runs WHERE id = $1', [runId]).catch(() => {});
    throw err;
  }
  const byIndex = new Map(inserted.map((d) => [d.stop_index, d]));

  return {
    run: {
      id: runId,
      rider_token: riderToken,
      // Opens this run in the Rider View. The token is in the #fragment, which browsers never send to servers.
      rider_url: `${origin}/rider?run=${runId}#token=${riderToken}`,
      profile: input.profile,
      status: 'active',
      optimized: input.optimize,
    },
    stops: stops.map((s, i) => {
      const d = byIndex.get(i)!;
      return {
        stop_index: i,
        delivery_id: d.id,
        code: s.code,
        formatted: formatPostcode(s.code),
        building_name: s.building.metadata?.name ?? null,
        recipient_name: s.recipient,
        destination: s.destination,
        claim: s.claimId ? s.claim : null,
        tracking_token: d.tracking_token,
        tracking_url: `${origin}/t/${d.tracking_token}`,
        requires_code: s.podCode != null,
        // Only the creator sees the code; never shown on the tracking page.
        ...(s.podCode != null && { pod_code: s.podCode }),
      };
    }),
  };
}

// ---- Reading a run (rider) -----------------------------------------------------

const RUN_STOPS_SQL = `
  SELECT d.stop_index, d.status, d.recipient_name, d.tracking_token, (d.pod_code IS NOT NULL) AS requires_code,
         c.share_token AS claim_share, ST_X(c.gate) AS gate_lng, ST_Y(c.gate) AS gate_lat, b.*
  FROM deliveries d
  LEFT JOIN claims c ON c.id = d.claim_id
  CROSS JOIN LATERAL (SELECT ${BUILDING_COLUMNS} FROM buildings WHERE buildings.id = d.building_id) b
  WHERE d.run_id = $1
  ORDER BY d.stop_index
`;

/** A run's stops as the rider sees them: never includes delivery codes. */
export async function getRun(db: Db, run: { id: string; status: string; profile: string }, origin: string) {
  const { rows } = await db.query(RUN_STOPS_SQL, [run.id]);
  return {
    run: { id: run.id, status: run.status, profile: run.profile },
    stops: rows.map((r: any) => ({
      stop_index: r.stop_index,
      status: r.status,
      code: r.nipost_code,
      formatted: formatPostcode(r.nipost_code),
      building_name: r.metadata?.name ?? null,
      recipient_name: r.recipient_name,
      destination: (r.gate_lng != null
        ? { point: [r.gate_lng, r.gate_lat], kind: 'gate', source: 'claim' }
        : destinationFor(r)) as Destination,
      claim: r.claim_share ?? null,
      tracking_token: r.tracking_token,
      tracking_url: `${origin}/t/${r.tracking_token}`,
      requires_code: r.requires_code,
    })),
  };
}

// ---- Rider updates -------------------------------------------------------------

export async function updatePosition(
  db: Db,
  runId: string,
  body: { lng: number; lat: number; heading?: number; current_stop?: number; remaining_m?: number; eta_s?: number; arrived?: boolean },
) {
  await db.query(
    `UPDATE delivery_runs
        SET position = ST_SetSRID(ST_MakePoint($2, $3), 4326), heading = $4, position_at = now()
      WHERE id = $1 AND status = 'active'`,
    [runId, body.lng, body.lat, Number.isFinite(body.heading) ? body.heading : null],
  );
  if (Number.isInteger(body.current_stop)) {
    await db.query(
      `UPDATE deliveries
          SET status = CASE WHEN $3::boolean THEN 'arrived' ELSE 'en_route' END,
              remaining_m = $4, eta_s = $5
        WHERE run_id = $1 AND stop_index = $2 AND status IN ('pending', 'en_route', 'arrived')`,
      [
        runId,
        body.current_stop,
        body.arrived === true,
        Number.isFinite(body.remaining_m) ? Math.round(body.remaining_m!) : null,
        Number.isFinite(body.eta_s) ? Math.round(body.eta_s!) : null,
      ],
    );
  }
}

export type CompleteInput = { pod_code?: string; received_by?: string; photo?: string };

/** Decodes a data: URL photo, enforcing type and size. */
export function decodePhoto(dataUrl: string): { contentType: string; data: Buffer } {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || !PHOTO_TYPES.includes(m[1])) throw new RunError(400, 'INVALID_PHOTO', 'photo must be a JPEG, PNG or WebP data URL.');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > PHOTO_MAX_BYTES) throw new RunError(413, 'PHOTO_TOO_LARGE', 'The photo is larger than 1.5 MB.');
  return { contentType: m[1], data };
}

export async function completeStop(db: Db, runId: string, stopIndex: number, input: CompleteInput, onWrongCode: () => Promise<boolean>) {
  const { rows } = await db.query(
    'SELECT id, status, pod_code FROM deliveries WHERE run_id = $1 AND stop_index = $2',
    [runId, stopIndex],
  );
  const delivery = rows[0];
  if (!delivery) throw new RunError(404, 'STOP_NOT_FOUND', 'No such stop in this run.');
  if (delivery.status === 'delivered') throw new RunError(409, 'ALREADY_DELIVERED', 'This stop is already delivered.');

  let codeOk = false;
  if (delivery.pod_code) {
    if (!(await onWrongCode())) throw new RunError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes. Try again in 15 minutes.');
    if (String(input.pod_code ?? '') !== delivery.pod_code) {
      throw new RunError(400, 'WRONG_CODE', 'That delivery code is not right. Ask the customer to check it.');
    }
    codeOk = true;
  }
  const photo = input.photo ? decodePhoto(input.photo) : null;
  const receivedBy = typeof input.received_by === 'string' ? input.received_by.trim().slice(0, 80) || null : null;
  if (!codeOk && !photo) {
    throw new RunError(400, 'POD_REQUIRED', 'Take a photo of the delivery as proof.');
  }

  if (photo) {
    await db.query(
      `INSERT INTO delivery_photos (delivery_id, content_type, data) VALUES ($1, $2, $3)
       ON CONFLICT (delivery_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, created_at = now()`,
      [delivery.id, photo.contentType, photo.data],
    );
  }
  const method = codeOk && photo ? 'code+photo' : codeOk ? 'code' : 'photo';
  const { rows: done } = await db.query(
    `UPDATE deliveries
        SET status = 'delivered', delivered_at = now(), received_by = $2, pod_method = $3, remaining_m = 0, eta_s = 0
      WHERE id = $1
      RETURNING delivered_at`,
    [delivery.id, receivedBy, method],
  );
  // When every stop is finished, the run ends.
  const { rows: left } = await db.query(
    `SELECT min(stop_index) AS next FROM deliveries WHERE run_id = $1 AND status NOT IN ('delivered', 'failed')`,
    [runId],
  );
  const next = left[0]?.next ?? null;
  if (next === null) await db.query(`UPDATE delivery_runs SET status = 'ended', ended_at = now() WHERE id = $1`, [runId]);
  return { stop_index: stopIndex, status: 'delivered', delivered_at: done[0].delivered_at, pod_method: method, next_stop: next };
}

export async function endRun(db: Db, runId: string) {
  await db.query(`UPDATE delivery_runs SET status = 'ended', ended_at = now() WHERE id = $1 AND status = 'active'`, [runId]);
  await db.query(
    `UPDATE deliveries SET status = 'failed' WHERE run_id = $1 AND status IN ('pending', 'en_route', 'arrived')`,
    [runId],
  );
}

// ---- Customer tracking ---------------------------------------------------------

const TRACKING_SQL = `
  SELECT d.status, d.stop_index, d.eta_s, d.remaining_m, d.delivered_at, d.received_by, d.pod_method, d.recipient_name,
         (p.delivery_id IS NOT NULL) AS has_photo,
         r.status AS run_status, r.profile, r.heading, r.position_at,
         ST_X(r.position) AS rider_lng, ST_Y(r.position) AS rider_lat,
         (SELECT count(*) FROM deliveries x WHERE x.run_id = d.run_id)::int AS stops_total,
         (SELECT count(*) FROM deliveries x
           WHERE x.run_id = d.run_id AND x.stop_index < d.stop_index AND x.status NOT IN ('delivered', 'failed'))::int AS stops_before,
         ST_X(c.gate) AS gate_lng, ST_Y(c.gate) AS gate_lat,
         b.*
  FROM deliveries d
  JOIN delivery_runs r ON r.id = d.run_id
  LEFT JOIN delivery_photos p ON p.delivery_id = d.id
  LEFT JOIN claims c ON c.id = d.claim_id
  CROSS JOIN LATERAL (SELECT ${BUILDING_COLUMNS} FROM buildings WHERE buildings.id = d.building_id) b
  WHERE d.tracking_token = $1
`;

/**
 * What the customer's tracking page shows. The rider's live position is only
 * shared once this is their current stop: customers further down the run
 * don't see where the rider is delivering to others.
 */
export async function getTracking(db: Db, token: string) {
  if (!isUuid(token)) return null;
  const { rows } = await db.query(TRACKING_SQL, [token]);
  if (!rows.length) return null;
  const row = rows[0];
  const live = row.run_status === 'active' && row.stops_before === 0 && ['pending', 'en_route', 'arrived'].includes(row.status);
  const destination: Destination =
    row.gate_lng != null ? { point: [row.gate_lng, row.gate_lat], kind: 'gate', source: 'claim' } : destinationFor(row);
  return {
    ...buildingBody(row.nipost_code, row),
    destination,
    delivery: {
      status: row.status,
      stop_index: row.stop_index,
      stops_total: row.stops_total,
      stops_before: row.stops_before,
      recipient_name: row.recipient_name,
      eta_s: live ? row.eta_s : null,
      remaining_m: live ? row.remaining_m : null,
      delivered_at: row.delivered_at,
      received_by: row.received_by,
      pod_method: row.pod_method,
      has_photo: row.has_photo,
    },
    rider:
      live && row.rider_lng != null
        ? { position: [row.rider_lng, row.rider_lat], heading: row.heading, updated_at: row.position_at, profile: row.profile }
        : null,
  };
}

export async function getTrackingPhoto(db: Db, token: string) {
  if (!isUuid(token)) return null;
  const { rows } = await db.query(
    `SELECT p.content_type, p.data FROM deliveries d JOIN delivery_photos p ON p.delivery_id = d.id WHERE d.tracking_token = $1`,
    [token],
  );
  return rows[0] ?? null;
}
