// Client side of dispatch runs: the Rider View's calls to /api/v1/runs.
import type { LngLat } from '../geo';
import type { RouteProfile } from '../postcode';

export type RunStop = {
  stop_index: number;
  code: string;
  formatted: string;
  building_name: string | null;
  recipient_name: string | null;
  destination: { point: LngLat; kind: 'gate' | 'center'; source: string };
  /** Share id of the claim whose gate this stop routes to. */
  claim: string | null;
  tracking_url: string;
  requires_code: boolean;
  status?: 'pending' | 'en_route' | 'arrived' | 'delivered' | 'failed';
};

export type RunState = { id: string; token: string; stops: RunStop[]; current: number };

export class RunApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.token && { 'X-Rider-Token': init.token }),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new RunApiError(res.status, body?.message ?? `Request failed (HTTP ${res.status}).`);
  return body as T;
}

export async function createRun(input: {
  profile: RouteProfile;
  optimize: boolean;
  from: LngLat;
  stops: { code: string; claim?: string | null }[];
}): Promise<RunState> {
  const body = await call<{ run: { id: string; rider_token: string }; stops: RunStop[] }>('/api/v1/runs', {
    method: 'POST',
    body: JSON.stringify({ ...input, stops: input.stops.map((s) => ({ code: s.code, ...(s.claim && { claim: s.claim }) })) }),
  });
  return { id: body.run.id, token: body.run.rider_token, stops: body.stops.map((s) => ({ ...s, status: 'pending' })), current: 0 };
}

export async function loadRun(id: string, token: string): Promise<RunState> {
  const body = await call<{ stops: RunStop[] }>(`/api/v1/runs/${id}`, { token });
  const next = body.stops.find((s) => s.status !== 'delivered' && s.status !== 'failed');
  return { id, token, stops: body.stops, current: next?.stop_index ?? body.stops.length };
}

export function reportPosition(
  run: RunState,
  body: { lng: number; lat: number; heading: number; current_stop: number; remaining_m: number; eta_s: number; arrived?: boolean },
) {
  return call<void>(`/api/v1/runs/${run.id}/position`, { method: 'POST', token: run.token, body: JSON.stringify(body) });
}

export function completeStop(run: RunState, index: number, body: { pod_code?: string; received_by?: string; photo?: string }) {
  return call<{ next_stop: number | null; pod_method: string }>(`/api/v1/runs/${run.id}/stops/${index}/complete`, {
    method: 'POST',
    token: run.token,
    body: JSON.stringify(body),
  });
}

export function endRun(run: RunState) {
  return call<void>(`/api/v1/runs/${run.id}/end`, { method: 'POST', token: run.token });
}

/** The Rider View URL that resumes this run; the token stays in the #fragment. */
export function runUrl(run: RunState) {
  return `/rider?run=${run.id}#token=${encodeURIComponent(run.token)}`;
}

/** The run id and token from the current URL (?run=…#token=…), if any. */
export function runFromUrl(): { id: string; token: string } | null {
  const id = new URLSearchParams(window.location.search).get('run');
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  return id && token ? { id, token } : null;
}

/**
 * Shrinks a camera photo on the phone before upload: longest side 1280 px,
 * JPEG at 72% quality, which keeps a delivery photo well under the 1.5 MB cap.
 */
export async function compressPhoto(file: File, maxSide = 1280, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
