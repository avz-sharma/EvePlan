import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../api/client";
import { planActions } from "../state/planStore";
import { App } from "../App";
import { Button, GlassPanel } from "./ui";

type Identity = { id: string; name: string };
type Session = { required: boolean; configured: boolean; user: Identity | null };

export function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(new URLSearchParams(window.location.search).has("auth_error") ? "Google sign-in was cancelled or could not be completed. Please try again." : "");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/auth/session"), { signal, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Sign-in is temporarily unavailable. Please retry.");
      const next = await response.json() as Session;
      if (next.user || !next.required) {
        planActions.setOwner(next.user?.id ?? null);
        try { planActions.restore(); } catch { /* The planner handles unavailable browser storage. */ }
      }
      setSession(next);
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Sign-in is unavailable."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const logout = async () => {
    try {
      const response = await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Sign-out failed. Please retry.");
      planActions.setOwner(null); setSession(current => current ? { ...current, user: null } : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sign-out failed."); }
  };
  if (!loading && session && (session.user || !session.required)) return <>
    {session.user && <div className="flex flex-wrap items-center justify-end gap-3 border-b border-line bg-white/80 px-4 py-2 text-sm"><span>Signed in as {session.user.name}</span><Button onClick={() => void logout()}>Sign out</Button>{error && <span role="alert">{error}</span>}</div>}
    <App />
  </>;
  return <main className="app-shell grid min-h-screen place-items-center p-5"><GlassPanel className="w-full max-w-md space-y-5 p-8 text-center">
    <img src="/eveplan-logo.png" alt="EvePlan" width="100" height="100" className="mx-auto rounded-2xl" />
    <h1 className="text-3xl">Welcome to EvePlan</h1>
    <p className="text-muted">Sign in to set up your celebration and manage your event plan.</p>
    {loading ? <p role="status">Checking your session…</p> : session?.configured ? <a className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-white px-5 font-semibold" href={apiUrl("/api/auth/google")}>Continue with Google</a> : <p role="status">Google sign-in is being set up by the site owner. Please check back shortly.</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {!loading && <Button onClick={() => { setError(""); void load(); }}>Retry connection</Button>}
    <p className="text-xs text-muted">Your plans stay in this browser, separated by Google account.</p>
  </GlassPanel></main>;
}
