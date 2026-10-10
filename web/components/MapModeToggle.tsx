'use client';

import { useEffect, useState } from 'react';
import { resolveMapMode, setMapModeChoice, type MapMode } from '@/lib/mapMode';

/**
 * "3D | Lite" switch. The choice is remembered on this device; changing it
 * reloads the page (same URL), since lite mode uses a different base map.
 */
export default function MapModeToggle({ disabled = false, className = '' }: { disabled?: boolean; className?: string }) {
  // Read on the client only: storage and device hints don't exist on the server.
  const [state, setState] = useState<{ mode: MapMode; automatic: boolean } | null>(null);
  useEffect(() => setState(resolveMapMode()), []);
  if (!state) return null;

  function choose(mode: MapMode) {
    if (mode === state!.mode && !state!.automatic) return;
    setMapModeChoice(mode);
    window.location.reload();
  }

  return (
    <div role="radiogroup" aria-label="Map detail" className={`flex items-center gap-1 ${className}`}>
      {(['full', 'lite'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={state.mode === mode}
          disabled={disabled}
          onClick={() => choose(mode)}
          title={mode === 'lite' ? 'Flat, lighter map for slow phones and limited data' : 'Full 3D city'}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
            state.mode === mode ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {mode === 'full' ? '3D' : 'Lite'}
          {state.mode === mode && state.automatic ? ' · auto' : ''}
        </button>
      ))}
    </div>
  );
}
