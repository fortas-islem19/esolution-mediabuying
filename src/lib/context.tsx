import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Api } from './api';
import type { Me, MediaBuyer } from './types';

interface AppCtx {
  api: Api;
  me: Me;
  buyers: MediaBuyer[];
  /** Notification courte en bas de l'écran */
  notify(message: string, kind?: 'ok' | 'error'): void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ value, children }: { value: AppCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp hors AppProvider');
  return v;
}

/**
 * Charge une donnée et la recharge automatiquement à chaque changement
 * (temps réel Supabase ou modification locale en mode démo).
 */
export function useLive<T>(load: () => Promise<T>, deps: unknown[]) {
  const { api } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    loadRef.current().then((d) => { setData(d); setError(null); }).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = api.subscribe(() => { clearTimeout(timer); timer = setTimeout(reload, 250); });
    return () => { clearTimeout(timer); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, reload };
}
