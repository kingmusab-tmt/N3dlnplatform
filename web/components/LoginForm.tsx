'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { normalizePhone } from '@/lib/postcode';
import { PHONE_AUTH_ENABLED, getSupabase } from '@/lib/supabase/client';

type Method = 'email' | 'phone';
type Step = { kind: 'enter' } | { kind: 'code'; destination: string } | { kind: 'working' };

/**
 * Sign in (or sign up) with a 6-digit code sent by email or SMS. Codes work
 * better than magic links on phones, where email links often open in a
 * different browser than the one signing in.
 */
export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = getSupabase();
  const [method, setMethod] = useState<Method>('email');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'enter' });
  const [error, setError] = useState<string | null>(null);

  if (!supabase) {
    return <p className="text-slate-300">Sign-in isn't configured on this server (NEXT_PUBLIC_SUPABASE_URL is missing).</p>;
  }

  function destinationFor(): string | null {
    if (method === 'phone') return normalizePhone(contact);
    const email = contact.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const destination = destinationFor();
    if (!destination) {
      setError(method === 'phone' ? 'Enter a valid phone number, e.g. 0803 123 4567.' : 'Enter a valid email address.');
      return;
    }
    setStep({ kind: 'working' });
    const { error } = await supabase!.auth.signInWithOtp(
      method === 'phone' ? { phone: destination } : { email: destination, options: { shouldCreateUser: true } },
    );
    if (error) {
      setError(friendly(error.message));
      setStep({ kind: 'enter' });
      return;
    }
    setCode('');
    setStep({ kind: 'code', destination });
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== 'code') return;
    setError(null);
    const destination = step.destination;
    setStep({ kind: 'working' });
    const token = code.replace(/\D/g, '');
    const { error } = await supabase!.auth.verifyOtp(
      method === 'phone' ? { phone: destination, token, type: 'sms' } : { email: destination, token, type: 'email' },
    );
    if (error) {
      setError(friendly(error.message));
      setStep({ kind: 'code', destination });
      return;
    }
    router.replace(next);
    router.refresh();
  }

  const working = step.kind === 'working';

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
      <h1 className="text-xl font-semibold text-slate-100">Sign in</h1>
      <p className="mt-1 text-sm text-slate-400">To claim places and manage your share links. New here? This creates your account.</p>

      {step.kind !== 'code' ? (
        <form onSubmit={sendCode} className="mt-5 space-y-3">
          {PHONE_AUTH_ENABLED && (
          <div role="radiogroup" aria-label="Sign in with" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1 text-sm">
            {(['email', 'phone'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => {
                  setMethod(m);
                  setContact('');
                  setError(null);
                }}
                className={`rounded-md py-1.5 font-medium ${method === m ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {m === 'email' ? 'Email' : 'Phone'}
              </button>
            ))}
          </div>
          )}
          <label className="block">
            <span className="text-xs text-slate-400">{method === 'email' ? 'Email address' : 'Phone number'}</span>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              type={method === 'email' ? 'email' : 'tel'}
              inputMode={method === 'email' ? 'email' : 'tel'}
              autoComplete={method === 'email' ? 'email' : 'tel'}
              placeholder={method === 'email' ? 'you@example.com' : '0803 123 4567'}
              autoFocus
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
            disabled={working}
            className="w-full rounded-lg bg-[#39FF14] px-3 py-2 font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
          >
            {working ? 'Sending…' : method === 'email' ? 'Email me a code' : 'Text me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-5 space-y-3">
          <p className="text-sm text-slate-300">
            Enter the 6-digit code sent to <span className="font-medium text-slate-100">{step.destination}</span>.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="123456"
            autoFocus
            aria-label="Code"
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-center font-mono text-2xl tracking-[0.5em] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={working || code.replace(/\D/g, '').length < 6}
            className="w-full rounded-lg bg-[#39FF14] px-3 py-2 font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setStep({ kind: 'enter' })}
            className="w-full text-sm text-slate-400 hover:text-slate-200"
          >
            Use a different {method === 'email' ? 'email' : 'number'}
          </button>
        </form>
      )}

      <Link href="/map" className="mt-5 block text-center text-sm text-slate-500 hover:text-slate-300">
        ← Back to the map
      </Link>
    </div>
  );
}

/** Supabase Auth messages, phrased for people. */
function friendly(message: string) {
  if (/expired|invalid/i.test(message)) return 'That code is wrong or has expired. Check it, or ask for a new one.';
  if (/rate limit|too many|security purposes/i.test(message)) return 'Too many attempts. Wait a minute, then try again.';
  if (/phone provider|sms/i.test(message)) return 'Text messages are not set up yet. Sign in with email instead.';
  return message;
}
