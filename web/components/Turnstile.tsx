'use client';
// Cloudflare Turnstile CAPTCHA for sign-in. Supabase Auth verifies the token
// (Authentication → Bot and Abuse Protection). Shown only when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; Cloudflare's test key always passes.
import { useEffect, useRef } from 'react';

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile failed to start')));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * The widget. `onToken` gets a fresh token, or null when it expires or fails.
 * Tokens are single-use: bump `resetKey` after each sign-in request.
 */
export default function Turnstile({
  onToken,
  onError,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  onError?: (message: string) => void;
  resetKey: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !ref.current) return;
        widgetId.current = api.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          size: 'flexible',
          action: 'sign-in',
          callback: (token: string) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(null),
          'error-callback': () => {
            callbacks.current.onToken(null);
            callbacks.current.onError?.('The security check failed to load. Refresh the page and try again.');
          },
        });
      })
      .catch(() => callbacks.current.onError?.('The security check could not load. Check your connection and refresh.'));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current) {
      callbacks.current.onToken(null);
      window.turnstile?.reset(widgetId.current);
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className="min-h-[65px]" aria-label="Security check" />;
}
