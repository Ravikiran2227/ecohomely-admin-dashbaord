import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router";
import { ROLE_NAMES, type Role } from "@/auth/matrix";
import { useOptionalSession } from "@/auth/session";
import { Button, Card, PageHeader } from "@/ui/primitives";

/**
 * Permission panel (project head fix list, 19 Nov 2026): who may open this (role code and name, plus the department head
 * where it applies), the roles the signed-in person holds, and how to get access. `needed` takes the "Name (CODE)" strings
 * of `rolesNeeded()`; `roles` (codes) and `headOf` add structured entries. Used as a page (default) or inline (`inline`).
 */
export function PermissionPanel({ needed = [], roles = [], headOf, what, inline = false, serverNote }: {
  needed?: string[]; roles?: readonly Role[]; headOf?: string; what: string; inline?: boolean; serverNote?: string;
}) {
  const user = useOptionalSession()?.user ?? null;
  const fromRoles = roles.map((r) => `${ROLE_NAMES[r]} (${r})`);
  const all = [...new Set([...fromRoles, ...needed, ...(headOf ? [`Department Head (DH) of ${headOf}`] : [])])];
  const mine = user?.roles.length ? user.roles.map((r) => `${ROLE_NAMES[r]} (${r})`).join(", ") : "none";
  return (
    <Card role="alert" aria-label="Access needed" className={inline ? "" : "max-w-2xl"}>
      <p className="text-sm font-medium">Your roles do not allow {what}.</p>
      {all.length > 0 ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-n-500">Who can open this</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Roles with access">
            {all.map((n) => <li key={n} className="rounded-sm border border-line bg-n-25 px-2 py-0.5 text-xs">{n}</li>)}
          </ul>
        </>
      ) : null}
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-n-500">Your roles</p>
      <p className="mt-1 text-sm text-muted">{mine}{user?.departments.length ? ` · departments ${user.departments.join(", ")}` : ""}</p>
      {serverNote ? <p className="mt-3 text-sm text-muted">{serverNote}</p> : null}
      <p className="mt-3 text-sm">
        To get access, ask a <strong>Super Admin</strong>. Access changes are approved by a second Super Admin and recorded.
      </p>
      {inline ? null : (
        <Link className="mt-4 inline-block text-sm font-medium text-primary underline" to="/my-work">
          Back to My work
        </Link>
      )}
    </Card>
  );
}

/** AS-10: permission denied (names the roles needed and who to ask), not found, and error pages. */
export function PermissionDenied({ needed, what, roles, headOf, serverNote }: { needed: string[]; what: string; roles?: readonly Role[]; headOf?: string; serverNote?: string }) {
  return (
    <div>
      <PageHeader title="You don't have access to this" />
      <PermissionPanel needed={needed} what={what} roles={roles} headOf={headOf} serverNote={serverNote} />
    </div>
  );
}

export function NotFound() {
  return (
    <div>
      <PageHeader title="Page not found" subtitle="The address does not match any screen in the console." />
      <Link className="text-sm font-medium text-primary underline" to="/my-work">
        Go to My work
      </Link>
    </div>
  );
}

export function ErrorScreen({ requestId, onReset }: { requestId: string; onReset: () => void }) {
  return (
    <div className="max-w-lg py-4">
      <PageHeader title="Something went wrong" subtitle="The screen could not be shown. Nothing was changed." />
      <Card role="alert">
        <p className="text-sm text-muted">If this keeps happening, tell the platform admin and quote this request id.</p>
        <p className="mt-2 font-mono text-xs">{requestId}</p>
        <Button className="mt-4" onClick={onReset}>
          Try again
        </Button>
      </Card>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError() {
    return { failed: `req-${Date.now().toString(36)}` };
  }
  componentDidCatch(_e: Error, _i: ErrorInfo) {
    // Offline build: nothing is sent anywhere. GlitchTip wiring is a later task (P5).
  }
  render() {
    if (this.state.failed) return <ErrorScreen requestId={this.state.failed} onReset={() => this.setState({ failed: null })} />;
    return this.props.children;
  }
}
