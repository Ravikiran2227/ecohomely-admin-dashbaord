/**
 * Per-environment values for the Ecohomely admin dashboard.
 *
 * This module is read in **Node, at build time** — by `vite.config.js`, which stamps the
 * active block into the bundle, and by the one-off scripts in `scripts/`. It is never
 * imported from `src/`, so only the active environment's values reach the browser
 * bundle; see `src/config/env.js`.
 *
 * `prod` reproduces exactly the values that were hardcoded in
 * `src/services/firebaseClient.js` before this module existed, so an unset `APP_ENV`
 * leaves production behaviour unchanged.
 *
 * Everything here is a Firebase *client* identifier. Those are published in the page
 * bundle by design and are not access control — the only thing standing between an
 * identifier and the data is `firestore.rules` / `storage.rules`. No server-side secret
 * (service account, MSG91 key, EmailJS private key) belongs in this file: this bundle is
 * served publicly, so anything inlined into it is readable by anyone who loads the page.
 */

export const environments = {
  prod: {
    firebase: {
      apiKey: 'AIzaSyA0BSrwXFoBeMvdN4efvfJqHRQarNbZap4',
      authDomain: 'ecohomely-app.firebaseapp.com',
      projectId: 'ecohomely-app',
      storageBucket: 'ecohomely-app.firebasestorage.app',
      messagingSenderId: '820094665311',
      appId: '1:820094665311:web:51105fe59b5fc6a40211ea',
      measurementId: 'G-4LNYHCBKVK',
    },
    // Nothing in src/ calls a cloud function today — the dashboard talks to Firestore
    // and Storage through the SDK. Kept so that the first caller that needs one has a
    // per-environment value to reach for instead of a hostname.
    functionsBase: 'https://us-central1-ecohomely-app.cloudfunctions.net',
  },

  dev: {
    firebase: {
      apiKey: 'AIzaSyCHvkrebDb-bqaelZdDVPum0O2fpZz1Bgc',
      authDomain: 'ecohomely-dev-4e198.firebaseapp.com',
      projectId: 'ecohomely-dev-4e198',
      storageBucket: 'ecohomely-dev-4e198.firebasestorage.app',
      messagingSenderId: '910409649668',
      appId: '1:910409649668:web:5d7a424bf1a44ca959af51',
      // No Analytics data stream is provisioned on the dev project. `null` means the key
      // is omitted from the config object rather than inheriting the production stream —
      // dev traffic must not land in production Analytics.
      measurementId: null,
    },
    functionsBase: 'https://us-central1-ecohomely-dev-4e198.cloudfunctions.net',
  },
}
