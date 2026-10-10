'use client';

import { FormEvent, useState } from 'react';
import { compressPhoto, type RunStop } from '@/lib/rider/run';

export type PodInput = { pod_code?: string; received_by?: string; photo?: string };

/**
 * Proof of delivery at a stop: the customer's 4-digit code when the stop has
 * one, otherwise a photo; who received it is optional.
 */
export default function PodForm({
  stop,
  onSubmit,
  saving,
  error,
}: {
  stop: RunStop;
  onSubmit: (input: PodInput) => void;
  saving: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function pickPhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    try {
      setPhoto(await compressPhoto(file));
    } catch {
      setPhotoError('Could not read that photo. Try again.');
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      ...(stop.requires_code && { pod_code: code.replace(/\D/g, '') }),
      ...(receivedBy.trim() && { received_by: receivedBy.trim() }),
      ...(photo && { photo }),
    });
  }

  const ready = stop.requires_code ? code.replace(/\D/g, '').length === 4 : !!photo;

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-400/30">
      <div>
        <p className="font-medium text-emerald-300">You’ve arrived at stop {stop.stop_index + 1}</p>
        <p className="text-xs text-slate-300">
          <span className="font-mono text-[#39FF14]">{stop.formatted}</span>
          {stop.building_name && ` · ${stop.building_name}`}
        </p>
      </div>

      {stop.requires_code && (
        <label className="block">
          <span className="text-xs text-slate-300">Delivery code from the customer</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="0000"
            className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-center font-mono text-xl tracking-[0.5em] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
        </label>
      )}

      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
          <span aria-hidden>📷</span>
          {photo ? 'Retake photo' : stop.requires_code ? 'Add a photo (optional)' : 'Take a delivery photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
        </label>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Delivery photo preview" className="mt-2 max-h-32 rounded-lg border border-white/10" />
        )}
        {photoError && (
          <p role="alert" className="mt-1 text-xs text-red-300">
            {photoError}
          </p>
        )}
      </div>

      <label className="block">
        <span className="text-xs text-slate-300">Received by (optional)</span>
        <input
          value={receivedBy}
          onChange={(e) => setReceivedBy(e.target.value)}
          maxLength={80}
          placeholder="Name of the person who took it"
          className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!ready || saving}
        className="w-full rounded-lg bg-[#39FF14] px-3 py-2.5 font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Confirm delivery'}
      </button>
    </form>
  );
}
