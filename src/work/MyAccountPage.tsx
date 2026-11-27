import { formatDateTime, usePolled } from "@/instant/hooks";
import { ROLE_NAMES } from "@/auth/matrix";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { Load, useAction, useApi } from "./common";

/** AS-09: my own MFA devices, sessions and saved views. Only the signed-in person's own data. */
export function MyAccountPage() {
  const { user, api } = useApi();
  const s = usePolled(() => api.me.sessions(user), null);
  const m = usePolled(() => api.me.mfaDevices(user), null);
  const v = usePolled(() => api.me.savedViews(user), null);
  const act = useAction(() => { s.reload(); v.reload(); });
  return (
    <div className="space-y-6">
      <PageHeader title="My account" subtitle="Your roles, second-factor devices, signed-in sessions and saved views." />
      {act.banner}
      <Card className="space-y-1 text-sm" aria-label="Roles">
        <h2 className="text-base font-semibold">{user.displayName}</h2>
        <p>{user.roles.map((r) => `${ROLE_NAMES[r]} (${r})`).join(", ")}</p>
        <p className="text-muted">Departments {user.departments.join(", ") || "none"}{user.headOf.length ? ` · head of ${user.headOf.join(", ")}` : ""}. Role changes go through a Super Admin and a second Super Admin.</p>
      </Card>
      <section aria-label="Second-factor devices" className="space-y-2">
        <h2 className="text-base font-semibold">Second-factor devices</h2>
        <Load p={m}>{(ds) => ds.length === 0 ? <Card className="text-sm">No device enrolled: you will be asked to enrol at the next sign-in.</Card> : (
          <ul className="space-y-1 text-sm">{ds.map((d) => <li key={d.id}>{d.label} ({d.kind.toUpperCase()}) · enrolled {formatDateTime(d.enrolledAt)}{d.lastUsedAt ? ` · last used ${formatDateTime(d.lastUsedAt)}` : ""}</li>)}</ul>
        )}</Load>
        <p className="text-xs text-muted">To replace a lost device, ask a Super Admin: a reset needs a second Super Admin (matrix rows 34 and 34a).</p>
      </section>
      <section aria-label="Sessions" className="space-y-2">
        <h2 className="text-base font-semibold">Signed-in sessions</h2>
        <Load p={s}>{(ss) => (
          <ul className="space-y-2">{ss.map((x) => (
            <li key={x.id}><Card className="flex flex-wrap items-center gap-2 text-sm" aria-label={`Session ${x.id}`}>
              <span className="font-medium">{x.device}</span>{x.current ? <Badge tone="ok">This session</Badge> : null}
              <span className="text-muted">signed in {formatDateTime(x.signedInAt)} · last seen {formatDateTime(x.lastSeenAt)} · {x.ipCity}</span>
              {!x.current ? <Button variant="secondary" className="ml-auto" aria-label={`Sign out ${x.device}`} onClick={() => void act.run(() => api.me.revokeSession(user, x.id), "Session signed out.")}>Sign out</Button> : null}
            </Card></li>
          ))}</ul>
        )}</Load>
      </section>
      <section aria-label="My saved views" className="space-y-2">
        <h2 className="text-base font-semibold">Saved views</h2>
        <Load p={v}>{(vs) => vs.length === 0 ? <p className="text-sm text-muted">No saved views yet. Save the filters on a list screen to reopen them here.</p> : (
          <ul className="space-y-1 text-sm">{vs.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{x.name}</span><code>{x.screen}</code><span className="text-muted">{Object.entries(x.filters).map(([k, val]) => `${k}=${val}`).join(", ")}</span>
              <Button variant="ghost" aria-label={`Delete ${x.name}`} onClick={() => void act.run(() => api.me.deleteView(user, x.id), "View deleted.")}>Delete</Button>
            </li>
          ))}</ul>
        )}</Load>
      </section>
    </div>
  );
}
