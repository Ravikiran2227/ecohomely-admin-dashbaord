import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ApiClient, Session } from "@/api/types";
import type { StaffUser } from "./permissions";

type SessionState = {
  user: StaffUser | null;
  /** Departments the person chose on first login (A7), within their assignment. null = not chosen yet. */
  myDepartments: number[] | null;
  /** True after the sign-in ended on its own (F1-B6: token refresh refused); the guards send the person to sign-in. */
  sessionEnded: boolean;
  api: ApiClient;
  /** Bumped when notifications change (for example marked read) so the bell refreshes at once. */
  notificationsVersion: number;
  notificationsChanged(): void;
  startSession(s: Session): void;
  chooseDepartments(ids: number[]): void;
  signOut(reason?: "expired"): Promise<"expired" | undefined>;
};

const Ctx = createContext<SessionState | null>(null);
const SESSION_KEY = "eh.session"; // synthetic mock session only, tab-scoped
const DEPT_KEY = (userId: string) => `eh.mydepartments.${userId}`;

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function loadDepartments(userId: string): number[] | null {
  try {
    const raw = localStorage.getItem(DEPT_KEY(userId));
    return raw ? (JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  // F1-B6: a Firebase (production) session lives in memory only: its tokens are never stored, so neither is the person.
  const memoryOnly = api.auth.kind === "firebase";
  const [user, setUser] = useState<StaffUser | null>(() => (memoryOnly ? null : (loadSession()?.user ?? null)));
  const [myDepartments, setMy] = useState<number[] | null>(() => {
    const u = memoryOnly ? null : loadSession()?.user;
    return u ? loadDepartments(u.id) : null;
  });

  const [sessionEnded, setSessionEnded] = useState(false);
  // F1-B6 fix: when the sign-in ends on its own, the in-memory session is cleared at once (the tokens are already gone).
  useEffect(
    () =>
      api.auth.onSessionEnded?.(() => {
        sessionStorage.removeItem(SESSION_KEY);
        setUser(null);
        setMy(null);
        setSessionEnded(true);
      }),
    [api],
  );

  const [notificationsVersion, setNotificationsVersion] = useState(0);
  const notificationsChanged = useCallback(() => setNotificationsVersion((v) => v + 1), []);

  const startSession = useCallback((s: Session) => {
    if (!memoryOnly) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSessionEnded(false);
    setUser(s.user);
    setMy(loadDepartments(s.user.id));
  }, [memoryOnly]);

  const chooseDepartments = useCallback(
    (ids: number[]) => {
      if (!user) return;
      localStorage.setItem(DEPT_KEY(user.id), JSON.stringify(ids));
      setMy(ids);
    },
    [user],
  );

  const signOut = useCallback(
    async (reason?: "expired") => {
      try {
        await api.auth.signOut();
      } finally {
        sessionStorage.removeItem(SESSION_KEY);
        setUser(null);
        setMy(null);
      }
      return reason;
    },
    [api],
  );

  const value = useMemo(
    () => ({ user, myDepartments, sessionEnded, api, notificationsVersion, notificationsChanged, startSession, chooseDepartments, signOut }),
    [user, myDepartments, sessionEnded, api, notificationsVersion, notificationsChanged, startSession, chooseDepartments, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The session when inside the provider, else null (for shared panels that also render in isolation). */
export function useOptionalSession(): SessionState | null {
  return useContext(Ctx);
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
