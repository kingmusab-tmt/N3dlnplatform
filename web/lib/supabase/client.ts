'use client';
// Supabase in the browser: signing in with email/SMS codes and reading the session.
// The session lives in cookies, so API route handlers and middleware see it too.
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Whether accounts (Supabase Auth) are available on this deployment. */
export const AUTH_ENABLED = Boolean(URL && KEY);

/** Phone (SMS code) sign-in: only where an SMS provider is set up in Supabase. */
export const PHONE_AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_PHONE === 'true';

let client: SupabaseClient | null = null;

/** The shared browser client, or null when Supabase Auth isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (!URL || !KEY) return null;
  client ??= createBrowserClient(URL, KEY);
  return client;
}

/** The signed-in user (undefined while loading, null when signed out), kept up to date. */
export function useUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return setUser(null);
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return user;
}

/** How to show who's signed in: their email, or their phone number. */
export function userLabel(user: User) {
  return user.email || (user.phone ? `+${user.phone.replace(/^\+/, '')}` : 'your account');
}
