/**
 * Resolves which environment block is active. Node side only — `vite.config.js` and the
 * scripts in `scripts/` use this; browser code uses `src/config/env.js`.
 *
 * Resolution order:
 *   1. `APP_ENV` — the same variable the user app and the partner app use.
 *   2. Vite's `--mode`, but only when it is literally `dev` or `prod`.
 *   3. `prod`.
 *
 * Unset therefore means production, so an unconfigured machine and every existing
 * deployment behave exactly as they do today.
 *
 * A name that is set but unknown throws instead of falling back. Falling back would mean
 * a machine that asked for a non-production environment silently getting production —
 * and with `firestore.rules` as permissive as it currently is, that is a dashboard
 * writing to live customer data while every other signal says it is not.
 */
import { environments } from './environments.js'

export const DEFAULT_ENV_NAME = 'prod'

/**
 * `mode` is deliberately only honoured for the exact names `dev` and `prod`. Vite's own
 * default modes are `development` (dev server) and `production` (build); mapping those
 * would make `npm run dev` point at the dev Firebase project, which is a behaviour change
 * for everyone who already runs it against production today.
 */
export function resolveEnvName({ appEnv, mode } = {}) {
  const fromMode = mode === 'dev' || mode === 'prod' ? mode : undefined
  const requested = appEnv || fromMode
  if (!requested) return DEFAULT_ENV_NAME
  if (!environments[requested]) {
    throw new Error(
      `[env] Unknown environment "${requested}". Known: ${Object.keys(environments).join(', ')}. ` +
        'Leave APP_ENV unset for production.'
    )
  }
  return requested
}

export function resolveEnv(options) {
  const name = resolveEnvName(options)
  return { name, config: environments[name] }
}

/** Convenience for the Node scripts, which only ever read `APP_ENV`. */
export function resolveEnvFromProcess(env = process.env) {
  return resolveEnv({ appEnv: env.APP_ENV })
}
