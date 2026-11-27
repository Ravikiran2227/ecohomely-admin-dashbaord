/**
 * Local staff login (READY (local) in `CONTRACT_STATUS.md`): `POST /api/v1/dev/staff/login` with `{"staff": "<key>"}`.
 * LOCAL PROFILE ONLY: the route answers loopback clients only, has no second factor, and is refused in production. Production
 * staff sign-in (Entra or Firebase with TOTP) is T-M4 / T2. Tokens live in memory only (never storage, URL or log) and die with
 * the page. Roles come from the server's database grants, not from the token, so the key only chooses WHICH test person we are.
 *
 * Two realms exist on the local 05 today: the STAFF realm (this login: E-27, audit, approvals, pincode, assign) and the older
 * OPERATIONS realm (job, payment and worker READS). The older reads answer only the local dev operations principal
 * (`dev-operations:<name>`, `/api/v1/dev/operations/...`), so in the local hybrid mode the console holds that second in-memory
 * token for those reads. Finding for Session T: ops reads are not yet in the staff realm.
 */
import { z } from "zod";
import type { Role } from "@/auth/matrix";
import { TransportError } from "../errors";
import { fetchMe, type RealIdentity } from "./identity";
import type { Http } from "./http";

/** One local key per P4 role (LOCAL_START_05.md section 3). */
const KEY_BY_ROLE: Record<Role, string> = {
  CS: "cs1", CM: "cm1", PM: "pm1", BO: "bo1", IO: "io1", QR: "qr1", VO: "vo1", TR: "tr1", FO: "fo1", FA: "fa1", DH: "dh1", PA: "pa1", SA: "sa1", AU: "au1", OC: "oc1",
  // NEW / RECONSTRUCTED roles (CR-T69, CR-T78): local keys added by the B demo seed (`_local\scripts\b_demo_seed.py`).
  MK: "mk1", SM: "sm1", CO: "co1",
};
/** When a mock person holds several roles, the most senior one decides which local test person signs in. */
const PRECEDENCE: Role[] = ["SA", "DH", "FA", "FO", "PA", "IO", "BO", "QR", "VO", "TR", "PM", "CM", "SM", "CO", "MK", "CS", "AU", "OC"];

export const pickStaffKey = (roles: readonly Role[]): string | null => {
  const r = PRECEDENCE.find((x) => roles.includes(x));
  return r ? KEY_BY_ROLE[r] : null;
};

export type Session05 = { token: string | null; legacyToken: string | null; identity: RealIdentity | null };
export type TokenStore = {
  get(): string | null;
  legacy(): string | null;
  identity(): RealIdentity | null;
  set(s: Partial<Session05>): void;
  clear(): void;
};
export const createTokenStore = (): TokenStore => {
  let s: Session05 = { token: null, legacyToken: null, identity: null };
  return {
    get: () => s.token,
    legacy: () => s.legacyToken,
    identity: () => s.identity,
    set: (p) => { s = { ...s, ...p }; },
    clear: () => { s = { token: null, legacyToken: null, identity: null }; },
  };
};

const LoginReply = z.object({ token: z.string().min(1), staff_id: z.string(), roles: z.array(z.string()) });

/** Logs in, then asks E-27 who we are (a second `Http` is used so the token is read from the store on each call). */
export async function devStaffLogin(http: Http, key: string, store: TokenStore): Promise<RealIdentity> {
  const r = LoginReply.safeParse(await http.post("/dev/staff/login", { staff: key }));
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  store.set({ token: r.data.token, legacyToken: `dev-operations:console-${key}` });
  const id = await fetchMe(http);
  store.set({ identity: id });
  return id;
}
