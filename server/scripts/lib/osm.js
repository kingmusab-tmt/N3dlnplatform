// Pure helpers for turning OpenStreetMap building ways into `buildings` rows
// with simulated NIPOST codes. No I/O here so it can be unit tested.

const METRES_PER_LEVEL = 3.2;
const UNITS_PER_AREA = 99; // building-unit segment runs 01-99
const AREA_CODES = [];
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) AREA_CODES.push(String.fromCharCode(a, b)); // AA..ZZ

/** Overpass QL for every building way in a bbox, plus entrance nodes for gate detection. */
export function buildOverpassQuery([minLng, minLat, maxLng, maxLat], timeoutSec = 180) {
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`; // Overpass wants S,W,N,E
  return `[out:json][timeout:${timeoutSec}];
(
  way["building"](${bbox});
  node["entrance"](${bbox});
);
out body geom;`;
}

/** "12", "12 m", "12.5m" -> 12 / 12.5; anything else -> null. */
export function parseMetres(value) {
  if (typeof value !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*m?\s*$/i.exec(value);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 && n < 1000 ? n : null;
}

function heightFromTags(tags) {
  const explicit = parseMetres(tags.height);
  if (explicit) return explicit;
  const levels = parseMetres(tags['building:levels']);
  return levels ? Math.round(levels * METRES_PER_LEVEL * 10) / 10 : null;
}

/** Entrance priority: a "main" entrance beats a generic one, which beats service/emergency doors. */
function entranceRank(type) {
  if (type === 'main') return 0;
  if (type === 'yes' || type === 'home' || type === 'entrance') return 1;
  return 2;
}

/**
 * Overpass elements -> [{ osm_id, ring: [[lng,lat],...], metadata }].
 * Skips anything that isn't a closed ring of at least 4 points.
 */
export function elementsToBuildings(elements) {
  const entrances = new Map();
  for (const el of elements) {
    if (el.type === 'node' && el.tags?.entrance) {
      entrances.set(el.id, { lng: el.lon, lat: el.lat, type: el.tags.entrance });
    }
  }

  const buildings = [];
  let skipped = 0;
  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.building || !Array.isArray(el.geometry)) continue;

    const ring = el.geometry.map((p) => [round7(p.lon), round7(p.lat)]);
    const closed = ring.length >= 4 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
    if (!closed) {
      skipped++;
      continue;
    }

    const tags = el.tags;
    const gate = (el.nodes ?? [])
      .map((id) => entrances.get(id))
      .filter(Boolean)
      .sort((a, b) => entranceRank(a.type) - entranceRank(b.type))[0];

    const metadata = compact({
      source: 'osm',
      code_source: 'simulated',
      building_type: tags.building === 'yes' ? null : tags.building,
      name: tags.name,
      height_m: heightFromTags(tags),
      floors: parseMetres(tags['building:levels']),
      street: tags['addr:street'],
      house_number: tags['addr:housenumber'],
      gate: gate && { lng: round7(gate.lng), lat: round7(gate.lat), type: gate.type, source: 'osm' },
    });

    buildings.push({ osm_id: el.id, ring, metadata });
  }
  return { buildings, skipped };
}

/**
 * Assigns `${prefix}${area}${unit}` codes in a north-west -> south-east sweep
 * over ~cellMetres grid cells, so neighbouring buildings share an area code.
 *
 * `existing` maps osm_id -> code for buildings already in the DB; they keep
 * their codes, and new buildings take the next free codes in sweep order.
 */
export function allocateCodes(buildings, { prefix, existing = new Map(), cellMetres = 150 }) {
  const taken = new Set(existing.values());
  const cellDeg = cellMetres / 111_320;

  const sorted = buildings
    .map((b) => ({ b, c: centroid(b.ring) }))
    .sort((p, q) => {
      const rowP = Math.floor(-p.c[1] / cellDeg); // north first
      const rowQ = Math.floor(-q.c[1] / cellDeg);
      if (rowP !== rowQ) return rowP - rowQ;
      const colP = Math.floor(p.c[0] / cellDeg); // then west first
      const colQ = Math.floor(q.c[0] / cellDeg);
      if (colP !== colQ) return colP - colQ;
      return q.c[1] - p.c[1] || p.c[0] - q.c[0];
    })
    .map((p) => p.b);

  let cursor = 0;
  const nextFree = () => {
    while (cursor < AREA_CODES.length * UNITS_PER_AREA) {
      const area = AREA_CODES[Math.floor(cursor / UNITS_PER_AREA)];
      const unit = String((cursor % UNITS_PER_AREA) + 1).padStart(2, '0');
      cursor++;
      const code = `${prefix}${area}${unit}`;
      if (!taken.has(code)) return code;
    }
    throw new Error(`Ran out of codes for district ${prefix} (max ${AREA_CODES.length * UNITS_PER_AREA}).`);
  };

  return sorted.map((b) => ({ ...b, code: existing.get(b.osm_id) ?? nextFree(), isNew: !existing.has(b.osm_id) }));
}

function centroid(ring) {
  const pts = ring.slice(0, -1);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

const round7 = (n) => Math.round(n * 1e7) / 1e7;

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}
