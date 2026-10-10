// Proofs of delivery made without a connection, saved on the phone and
// uploaded when the connection returns. Stored in localStorage so they
// survive the app being closed.
import { RunApiError, completeStop, type RunState } from './run';

const KEY = 'n3d:outbox';

export type QueuedProof = {
  run: { id: string; token: string };
  stopIndex: number;
  body: { pod_code?: string; received_by?: string; photo?: string };
  queuedAt: number;
};

function read(): QueuedProof[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function write(items: QueuedProof[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

/** Saves a proof of delivery for later. False if the phone couldn't store it. */
export function queueProof(run: RunState, stopIndex: number, body: QueuedProof['body']) {
  const items = read().filter((q) => !(q.run.id === run.id && q.stopIndex === stopIndex));
  items.push({ run: { id: run.id, token: run.token }, stopIndex, body, queuedAt: Date.now() });
  return write(items);
}

export function pendingProofs(runId?: string) {
  return read().filter((q) => !runId || q.run.id === runId);
}

/**
 * Uploads queued proofs. A proof the server rejects (e.g. already delivered,
 * wrong code) is dropped and reported; network failures stay queued.
 */
export async function flushProofs(): Promise<{ sent: number; rejected: { stopIndex: number; message: string }[] }> {
  let sent = 0;
  const rejected: { stopIndex: number; message: string }[] = [];
  for (const item of read()) {
    try {
      await completeStop({ id: item.run.id, token: item.run.token, stops: [], current: 0 }, item.stopIndex, item.body);
      sent++;
    } catch (err) {
      if (!(err instanceof RunApiError)) continue; // still offline: keep it
      if (err.status !== 409) rejected.push({ stopIndex: item.stopIndex, message: err.message });
    }
    write(read().filter((q) => !(q.run.id === item.run.id && q.stopIndex === item.stopIndex)));
  }
  return { sent, rejected };
}
