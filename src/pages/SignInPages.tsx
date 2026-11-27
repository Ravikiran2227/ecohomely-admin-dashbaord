import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { PERSONAS } from "@/api/mock/data";
import { assignableDepartments } from "@/auth/guards";
import { useSession } from "@/auth/session";
import { DEPARTMENT_BY_ID } from "@/departments/registry";
import { Badge, Button, Card, Input } from "@/ui/primitives";

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <div>
        <p className="text-sm font-medium text-primary">ECOHOMELY</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </main>
  );
}

/**
 * AS-01 step 1. Local profile: email only (the console stores no passwords). Production profile (F1-B6, Firebase):
 * email and password, sent once to the identity service and never kept.
 */
export function SignIn() {
  const { api, user } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const firebase = api.auth.kind === "firebase";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const enrolled = (loc.state as { enrolled?: boolean } | null)?.enrolled === true;

  async function submit(e: FormEvent, address = email) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.auth.signIn(address, firebase ? password : undefined);
      setPassword("");
      if (r.status === "mfa_required") nav("/mfa", { state: { challengeId: r.challengeId } });
      else if (r.status === "mfa_enrolment_required") nav("/mfa/enrol", { state: { challengeId: r.challengeId } });
      else if (r.status === "locked") setMsg("This account is locked. Ask a Super Admin to unlock it. MFA can never be reset by yourself.");
      else if (r.status === "invalid_credentials") setMsg("The email or password is not correct.");
      else setMsg("No staff account uses that email. Check the address, or ask a Super Admin to create your account.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered title="Sign in to the Admin Console">
      {params.get("reason") === "expired" ? (
        <Card role="status" className="border-warn-bd text-sm">Your session expired. Sign in again to continue.</Card>
      ) : null}
      {enrolled ? (
        <Card role="status" className="text-sm">Authenticator app added. Sign in again with your password and a code from the app.</Card>
      ) : null}
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="email">Work email</label>
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {firebase ? (
          <>
            <label className="block text-sm font-medium" htmlFor="password">Password</label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">Continue</Button>
        {msg ? <p role="alert" className="text-sm text-danger">{msg}</p> : null}
      </form>
      {import.meta.env.DEV && !firebase ? (
        <Card className="space-y-2">
          <p className="text-xs font-medium text-muted">DEV ONLY (compiled out of production): synthetic staff for the mock. Second-step code is 123456.</p>
          <ul className="space-y-1">
            {PERSONAS.map((p) => (
              <li key={p.id}>
                <button type="button" className="text-left text-sm text-primary underline" onClick={(e) => void submit(e, p.email)}>
                  {p.displayName}
                </button>
                <span className="ml-2 text-xs text-muted">{p.blurb}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Centered>
  );
}

type Challenge = { challengeId?: string };

function useChallenge(): string | null {
  const loc = useLocation();
  return (loc.state as Challenge | null)?.challengeId ?? null;
}

function CodeForm({ challengeId }: { challengeId: string }) {
  const { api, startSession } = useSession();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.auth.verifyMfa(challengeId, code);
      if (!("status" in r)) {
        startSession(r);
        nav("/", { replace: true });
      } else if (r.status === "enrolled") nav("/sign-in", { replace: true, state: { enrolled: true } });
      else setError("That code is not valid. Check the code in your authenticator app and try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Sign in again.");
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="code">6-digit code</label>
      <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
      <Button type="submit" className="w-full">Verify</Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}

export function MfaChallenge() {
  const id = useChallenge();
  if (!id) return <Navigate to="/sign-in" replace />;
  return (
    <Centered title="Enter your authenticator code">
      <CodeForm challengeId={id} />
    </Centered>
  );
}

/** AS-01: forced TOTP enrolment on first login. Offline mock: a placeholder key, not a real secret. */
export function MfaEnrol() {
  const id = useChallenge();
  const { api } = useSession();
  const [key, setKey] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (id) {
      void api.auth.startMfaEnrolment(id).then(
        (r) => { if (live) setKey(r.setupKey); },
        (err: unknown) => { if (live) setFailed(err instanceof Error ? err.message : "The setup could not start. Sign in again."); },
      );
    }
    return () => { live = false; };
  }, [id, api]);
  if (!id) return <Navigate to="/sign-in" replace />;
  return (
    <Centered title="Set up your second step">
      <Card className="space-y-2 text-sm">
        <p>Staff accounts need an authenticator app (TOTP). Add this setup key to the app, then enter the code it shows.</p>
        {failed ? <p role="alert" className="text-danger">{failed}</p> : <p className="font-mono text-xs" aria-label="Setup key">{key ?? "Preparing…"}</p>}
        {api.auth.kind === "firebase" ? <p className="text-xs text-muted">Keep this key private. It is shown once and is not stored by the console.</p> : <Badge tone="warn">Mock key, offline build</Badge>}
      </Card>
      <CodeForm challengeId={id} />
    </Centered>
  );
}

/** AS-02: choose "My departments" within the assignment. */
export function FirstLogin() {
  const { user, myDepartments, chooseDepartments, signOut } = useSession();
  const nav = useNavigate();
  const [picked, setPicked] = useState<number[]>([]);
  if (!user) return <Navigate to="/sign-in" replace />;
  const options = assignableDepartments(user);
  if (options.length === 0) {
    return (
      <Centered title="No department assigned">
        <Card role="alert" className="space-y-3 text-sm">
          <p>You are signed in, but no department is assigned to your account yet. Contact a Super Admin to be assigned.</p>
          <Button variant="secondary" onClick={() => void signOut().then(() => nav("/sign-in"))}>Sign out</Button>
        </Card>
      </Centered>
    );
  }
  if (myDepartments !== null) return <Navigate to="/my-work" replace />;
  return (
    <Centered title="Choose your departments">
      <p className="text-sm text-muted">Pick the departments you work in. You can only choose from those assigned to you. You can change this later.</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          chooseDepartments(picked);
          nav("/my-work", { replace: true });
        }}
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">My departments</legend>
          {options.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={picked.includes(id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, id] : p.filter((x) => x !== id)))} />
              {DEPARTMENT_BY_ID.get(id)?.name}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={picked.length === 0}>Continue</Button>
      </form>
    </Centered>
  );
}
