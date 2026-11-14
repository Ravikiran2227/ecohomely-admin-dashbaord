/**
 * Error callbacks for Firestore realtime listeners (dashboard).
 *
 * WHY THIS EXISTS
 * ---------------
 * onSnapshot(ref, next) with no third argument fails SILENTLY. A security rule
 * rejection stops the success callback firing and produces no error anywhere —
 * the screen keeps its last data and looks healthy.
 *
 * All 8 of this app's listeners were in that state. During a rules rollout that
 * means a staff member sees a stale worker list and has no way to tell.
 *
 * USAGE
 *   onSnapshot(q, (snap) => { ... }, listenerError('workersApi/list'))
 *   onSnapshot(q, (snap) => { ... }, listenerError('workersApi/list', setError))
 */

const RULE_REJECTION_CODES = new Set(['permission-denied', 'unauthenticated'])

/** Most recent rule rejections, newest first. Handy from the browser console. */
const recentRejections = []

export function getRecentListenerRejections() {
  return [...recentRejections]
}

/**
 * Build an onSnapshot error callback.
 *
 * @param {string} label Code location, e.g. 'workersApi/list'. Never user data.
 * @param {Function} [onError] Optional UI callback receiving the Error.
 */
export function listenerError(label, onError) {
  return (error) => {
    const code = error?.code || 'unknown'
    const ruleRejection = RULE_REJECTION_CODES.has(code)

    if (ruleRejection) {
      console.error(`[listener:${label}] BLOCKED BY SECURITY RULE (${code})`, error?.message || '')
      recentRejections.unshift({ label, code, at: new Date().toISOString() })
      recentRejections.length = Math.min(recentRejections.length, 50)
    } else {
      console.warn(`[listener:${label}] ${code}`, error?.message || '')
    }

    if (typeof onError === 'function') {
      try {
        onError(error)
      } catch {
        // A broken UI handler must not escape into the Firestore SDK.
      }
    }
  }
}

/**
 * Wrap a Firestore read that currently swallows its error.
 *
 * The dashboard has several `try { ... } catch { return [] }` blocks. A denied
 * query returns an empty array and the screen renders "no results" — which is
 * indistinguishable from genuinely having no data. This keeps the empty-array
 * fallback (so behaviour does not change) but makes the failure visible first.
 *
 *   } catch (error) { reportSwallowed('firebaseClient/safeCollectionGroup', error); return [] }
 */
export function reportSwallowed(label, error) {
  const code = error?.code || 'unknown'
  if (RULE_REJECTION_CODES.has(code)) {
    console.error(`[query:${label}] BLOCKED BY SECURITY RULE (${code}) - returning empty result`, error?.message || '')
    recentRejections.unshift({ label, code, at: new Date().toISOString(), swallowed: true })
    recentRejections.length = Math.min(recentRejections.length, 50)
  } else {
    console.warn(`[query:${label}] ${code} - returning empty result`, error?.message || '')
  }
}
