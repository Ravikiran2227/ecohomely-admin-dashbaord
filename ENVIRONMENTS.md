# Environments — Ecohomely Admin Dashboard

This app can build and run against either Firebase project.

| | Development | Production |
|---|---|---|
| Firebase project | `ecohomely-dev-4e198` | `ecohomely-app` |
| Firestore / Auth / Storage | dev | live customer data |
| Cloud functions | `us-central1-ecohomely-dev-4e198` | `us-central1-ecohomely-app` |
| Analytics | not provisioned | `G-4LNYHCBKVK` |

## Switching

One variable, `APP_ENV`, read at **build time**. **Unset means production**, so every
existing deployment and every unconfigured machine behaves exactly as it does today.

```bash
APP_ENV=dev npm run dev      # dev server against ecohomely-dev-4e198
APP_ENV=dev npm run build    # production build against ecohomely-dev-4e198
npm run dev                  # unchanged: production
```

`APP_ENV=` is awkward on Windows `cmd`, so the same two environments are reachable
through Vite's `--mode`, which is cross-platform:

```bash
npm run dev:dev              # vite --mode dev
npm run build:dev            # vite build --mode dev
```

### Setting it once per machine

To stop typing the prefix, put it in `.env` at the repo root:

```
APP_ENV=dev
```

`vite.config.js` reads that through `loadEnv`, which also picks up `.env.local` and
`.env.[mode]`. Every `.env*` file except `.env.example` is gitignored, so this stays on
your machine and never reaches a deployment.

**It applies to `npm run build` as well as `npm run dev`**, so a production build made on
a machine with that line in `.env` points at the dev project. A shell variable overrides
the file, which is the way out:

```bash
APP_ENV=prod npm run build   # production build regardless of .env
```

### The part that is easy to get wrong

**`--mode development` is not the dev environment.** `development` and `production` are
Vite's own default modes — `npm run dev` runs in mode `development` and `npm run build` in
mode `production`, and both have always pointed at the production Firebase project. Only
the exact mode names `dev` and `prod` select an environment. Anything else resolves to
production.

An `APP_ENV` that is set to an unknown name (`staging`, a typo) **throws** rather than
falling back. Falling back would mean a machine that asked for a non-production
environment silently getting production.

## Checking which environment you are on

In the browser console of a running app:

```js
(await import('/src/config/env.js')).ENV_NAME
```

Or from the built output:

```bash
grep -o 'ecohomely-[a-z0-9-]*' dist/assets/firebaseClient-*.js | sort -u
```

A dev build contains **no** production identifier at all, and vice versa — see below.

## How it fits together

- `config/environments.js` — the `prod` / `dev` map. Read in **Node, at build time** only:
  by `vite.config.js` and by the scripts in `scripts/`. Never imported from `src/`.
- `config/resolveEnv.js` — decides which block is active (`APP_ENV`, then `--mode`, then
  `prod`). Also used by the scripts.
- `vite.config.js` — resolves the block and stamps it into the bundle through `define`,
  as `__APP_ENV__` and `__APP_ENV_CONFIG__`.
- `src/config/env.js` — the only thing browser code imports. Reads those two defines and
  exports `ENV_NAME`, `ENV`, `firebaseConfig`, `FUNCTIONS_BASE` and `requireEnvValue()`.
- `src/services/firebaseClient.js` — takes `firebaseConfig` from there.

### Why `define` rather than `VITE_*` variables

Vite only inlines `import.meta.env.VITE_*`, so a plain `APP_ENV` is invisible to browser
code — exactly as in the two mobile apps, where `app.config.js` has to pass it through
`extra.appEnv`. Here `vite.config.js` plays that role.

Stamping the **resolved block** rather than importing the map has one concrete benefit:
only the active environment's identifiers reach the bundle. A dev build carries no
production project id or API key, which matters for a bundle that is served publicly from
a host a new developer can reach.

The existing `VITE_FIREBASE_*` variables still win over the environment block, so any
deployment that already sets them is unaffected. A `VITE_FIREBASE_*` left over in a local
`.env` while `APP_ENV=dev` would quietly point a dev build back at production, so
`src/config/env.js` throws if that happens.

## What `APP_ENV` does *not* switch

- **`firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`.** These
  are deployed with the Firebase CLI, which takes its project from `.firebaserc` or
  `--project`, not from `APP_ENV`. Aliases now exist:

  ```bash
  firebase deploy --only firestore:rules --project dev
  ```

  `default` is still `ecohomely-app`, so a bare `firebase deploy` still targets
  production. That is deliberate — it is today's behaviour — but it is a sharp edge:
  **always pass `--project dev`.**

- **`functions/`.** `functions/index.js` already derives its project from `GCLOUD_PROJECT`,
  which the runtime sets to whichever project the functions were deployed into, so the
  code follows the deploy with no change. The literal `"ecohomely-app"` on line 20 is only
  the fallback for a local run outside a Firebase runtime, and `ECOHOMELY_APP_NAME` on
  line 19 is an internal `admin.initializeApp()` label, not a project reference. Deploying
  to dev is `firebase deploy --only functions --project dev`.

- **Scripts in `scripts/`.** These *do* read `APP_ENV`, and each prints the project it is
  about to write to on startup. They are one-off write scripts against live data —
  `node scripts/backfillBirthdayKeys.mjs` with `APP_ENV` unset writes to production users.

## Security notes

These are independent of the environment work and should not wait for it.

**`firestore.rules` and `storage.rules` are `allow read, write: if true`.** Every document
in Firestore and every object in Storage is world-readable and world-writable by anyone
who has the project id and API key — and the API key is published in this page bundle by
design, as it is in both mobile apps' binaries. This is the reason the mobile apps can
make unauthenticated Firestore REST calls with only an API key. It means customer data in
the production project is effectively public to anyone who loads the admin dashboard once.
Moving a developer onto the dev project does not change that; only rules do.

**Nothing server-side belongs in a `VITE_*` variable.** Vite inlines every `VITE_*` value
into the bundle, so an MSG91 key, an EmailJS private key or a service account placed there
is published. The `MSG91_*` entries at the bottom of `.env.example` are correctly
un-prefixed and are for backend use only.
