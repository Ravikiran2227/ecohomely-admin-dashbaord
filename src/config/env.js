/* global __APP_ENV__, __APP_ENV_CONFIG__ */
/**
 * The active environment, as seen by browser code.
 *
 * `APP_ENV` is a plain shell variable, so Vite does not inline it — Vite only inlines
 * `import.meta.env.VITE_*`. It is read in Node by `vite.config.js`, which resolves the
 * block from `config/environments.js` and stamps the result into the bundle through
 * `define` as `__APP_ENV__` / `__APP_ENV_CONFIG__`. This is the same shape as the mobile
 * apps, where `app.config.js` reads `APP_ENV` and passes it through `extra.appEnv`.
 *
 * Stamping the resolved block rather than importing the map has one concrete benefit
 * here: only the active environment's identifiers end up in the bundle, so a dev build
 * carries no production project id or API key at all. That matters for a bundle served
 * publicly from a host a new developer can reach.
 *
 * Import environment values from this module, never from `config/environments` — that
 * import would pull both blocks into the bundle and defeat the above.
 */

const ENV_CONFIG = typeof __APP_ENV_CONFIG__ === 'undefined' ? null : __APP_ENV_CONFIG__

if (!ENV_CONFIG) {
  // Only reachable outside a Vite build (a bare Node import, a test runner without the
  // Vite transform). Throwing is deliberate: there is no safe value to guess.
  throw new Error(
    '[env] Environment was not stamped into this build. ' +
      'src/config/env.js must be loaded through Vite, which defines __APP_ENV_CONFIG__.'
  )
}

export const ENV_NAME = typeof __APP_ENV__ === 'undefined' ? 'prod' : __APP_ENV__
export const ENV = ENV_CONFIG
export const IS_DEV_ENV = ENV_NAME !== 'prod'

/** Base URL for the environment's deployed cloud functions. Unused in src/ today. */
export const FUNCTIONS_BASE = ENV.functionsBase

/**
 * Guards values that exist in production but are not provisioned for this environment.
 * Throwing is deliberate: the alternative is falling back to the production value, which
 * would mean a dev build touching production data, billing or a third-party account.
 */
export function requireEnvValue(value, what) {
  if (value === null || value === undefined || value === '') {
    throw new Error(
      `[env] ${what} is not configured for the "${ENV_NAME}" environment. ` +
        'See config/environments.js.'
    )
  }
  return value
}

/**
 * The Firebase web config, assembled exactly as it was before this module existed: the
 * `VITE_FIREBASE_*` overrides still win, so any deployment that already sets them keeps
 * behaving identically. The environment block supplies what they do not.
 *
 * `measurementId` is dropped when the environment has none, so an environment without an
 * Analytics stream does not inherit another environment's.
 */
export const firebaseConfig = withoutEmptyMeasurementId({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || ENV.firebase.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || ENV.firebase.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || ENV.firebase.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || ENV.firebase.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || ENV.firebase.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ENV.firebase.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ENV.firebase.measurementId,
})

function withoutEmptyMeasurementId(config) {
  if (config.measurementId) return config
  const { measurementId: _dropped, ...rest } = config
  return rest
}

// A stale `VITE_FIREBASE_*` override left in a `.env` file would quietly point a
// non-production build back at production. Fail closed rather than discover it in the
// Firestore audit log.
if (IS_DEV_ENV) {
  for (const key of ['projectId', 'storageBucket']) {
    if (firebaseConfig[key] !== ENV.firebase[key]) {
      throw new Error(
        `[env] APP_ENV is "${ENV_NAME}" but firebase.${key} resolved to ` +
          `"${firebaseConfig[key]}" instead of "${ENV.firebase[key]}". ` +
          'A VITE_FIREBASE_* override is overriding the environment — clear it from .env.'
      )
    }
  }
}
