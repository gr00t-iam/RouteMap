import { useEffect, useState } from 'react';
import { isSupabaseConfigured, getSession, signInWithEmail, signOut, signUpWithEmail } from '@/lib/supabase';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { (async () => setSession(await getSession()))(); }, []);

  async function login() {
    setError(null);
    try { await signInWithEmail(email, password); setSession(await getSession()); }
    catch (e) { setError((e as Error).message); }
  }
  async function register() {
    setError(null);
    try { await signUpWithEmail(email, password); setSession(await getSession()); }
    catch (e) { setError((e as Error).message); }
  }
  async function logout() { await signOut(); setSession(null); }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="card p-5 space-y-3">
        <div className="text-sm font-medium">Supabase</div>
        {!isSupabaseConfigured() ? (
          <p className="text-sm text-slate-600">
            Supabase isn't configured yet. Set <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_URL</code> and{' '}
            <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code> (dev) or
            in your GitHub Action / Vercel environment (prod). See <code>docs/SUPABASE_SETUP.md</code>.
          </p>
        ) : session ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-emerald-700">Signed in</div>
            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input className="input" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" className="input" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={login}>Sign in</button>
              <button className="btn-ghost" onClick={register}>Create account</button>
            </div>
            {error && <div className="text-sm text-rose-700">{error}</div>}
          </div>
        )}
      </div>

      <div className="card p-5 text-sm space-y-2">
        <div className="text-sm font-medium">Routing engine</div>
        <p className="text-slate-600">Currently using <code className="bg-slate-100 px-1 rounded">{import.meta.env.VITE_OSRM_URL ?? 'public OSRM demo'}</code>.</p>
        <p className="text-slate-600">For 2,000+ stops in production, self-host OSRM (Docker) and update the env var. See <code>docs/OSRM_SELFHOST.md</code>.</p>
      </div>
    </div>
  );
}
