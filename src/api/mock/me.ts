/** F1-B5 mock server: own sessions, MFA devices, saved views (per person, filters only) and presence. */
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { SAVED_VIEWS_MAX, type MeApi, type PresenceApi, type SavedView, type StaffSession, type Viewer } from "../me";
import type { Shared } from "./shared";

const MIN = 60_000;
const PRESENCE_TTL = 60_000;
/** A filter value that looks like contact data is refused: saved views must never hold personal data (ADM-UX-016). */
const SENSITIVE = [/@/, /(\d[\s-]?){10,}/];
const SCREEN = /^\/[a-z0-9/-]{1,80}$/;

export function createMeMocks(sh: Shared): { me: MeApi; presence: PresenceApi } {
  const sessions = new Map<string, StaffSession[]>();
  const views = new Map<string, SavedView[]>();
  const sessionsOf = (id: string) => {
    let s = sessions.get(id);
    if (!s) {
      const t = sh.now();
      s = [
        { id: sh.seq("SES"), current: true, device: "Edge on Windows (this browser)", signedInAt: t - 30 * MIN, lastSeenAt: t, ipCity: "Visakhapatnam" },
        { id: sh.seq("SES"), current: false, device: "Chrome on Android", signedInAt: t - 26 * 60 * MIN, lastSeenAt: t - 3 * 60 * MIN, ipCity: "Visakhapatnam" },
      ];
      sessions.set(id, s);
    }
    return s;
  };
  const me: MeApi = {
    async sessions(u) {
      return sessionsOf(u.id).map((s) => ({ ...s }));
    },
    async revokeSession(u, id) {
      const list = sessionsOf(u.id);
      const s = list.find((x) => x.id === id);
      if (!s) throw new NotFoundError("Session"); // another person's session id is simply unknown here
      if (s.current) throw new ConflictError("Sign out to end this session.", "current_session");
      sessions.set(u.id, list.filter((x) => x.id !== id));
      sh.log(u, "own_session_revoked", id);
      return sessionsOf(u.id).map((x) => ({ ...x }));
    },
    async mfaDevices(u) {
      const p = sh.staff.find((s) => s.id === u.id);
      return p?.mfaEnrolled ? [{ id: `mfa-${u.id}`, kind: "totp", label: "Authenticator app", enrolledAt: sh.now() - 20 * 24 * 60 * MIN, lastUsedAt: sh.now() - 30 * MIN }] : [];
    },
    async savedViews(u, screen) {
      return (views.get(u.id) ?? []).filter((v) => !screen || v.screen === screen).map((v) => ({ ...v, filters: { ...v.filters } }));
    },
    async saveView(u, screen, name, filters) {
      const n = name.trim();
      if (!n || n.length > 40) throw new ValidationError("Give the view a name (up to 40 characters).", "name_invalid");
      if (!SCREEN.test(screen)) throw new ValidationError("Unknown screen.", "screen_invalid");
      const entries = Object.entries(filters).filter(([, v]) => v !== "");
      if (entries.length === 0) throw new ValidationError("Choose at least one filter to save.", "no_filters");
      if (entries.some(([k, v]) => k.length > 30 || v.length > 60 || SENSITIVE.some((re) => re.test(v)))) {
        throw new ValidationError("Saved views hold filters only, never a phone number, email or other personal data.", "sensitive_filter");
      }
      const list = views.get(u.id) ?? [];
      if (list.length >= SAVED_VIEWS_MAX) throw new ConflictError(`You can keep up to ${SAVED_VIEWS_MAX} saved views.`, "views_limit");
      if (list.some((v) => v.screen === screen && v.name.toLowerCase() === n.toLowerCase())) throw new ConflictError("You already have a view with this name here.", "name_taken");
      const v: SavedView = { id: sh.seq("VIEW"), screen, name: n, filters: Object.fromEntries(entries), createdAt: sh.now() };
      views.set(u.id, [...list, v]);
      return { ...v, filters: { ...v.filters } };
    },
    async deleteView(u, id) {
      const list = views.get(u.id) ?? [];
      if (!list.some((v) => v.id === id)) throw new NotFoundError("Saved view");
      views.set(u.id, list.filter((v) => v.id !== id));
    },
  };

  const seen = new Map<string, Map<string, Viewer & { at: number }>>();
  const presence: PresenceApi = {
    async heartbeat(u, resource) {
      if (!/^[a-z_]+:[A-Za-z0-9-]{1,40}$/.test(resource)) throw new ValidationError("Unknown record.", "resource_invalid");
      const t = sh.now();
      const m = seen.get(resource) ?? new Map();
      const prev = m.get(u.id);
      m.set(u.id, { staffId: u.id, displayName: u.displayName, since: prev?.since ?? t, at: t });
      seen.set(resource, m);
      return [...m.values()].filter((v) => v.staffId !== u.id && t - v.at <= PRESENCE_TTL).map(({ at: _a, ...v }) => v);
    },
    async leave(u, resource) {
      seen.get(resource)?.delete(u.id);
    },
  };
  return { me, presence };
}
