import { initializeApp } from 'firebase/app'
import { collection, getDocs, initializeFirestore, setDoc, doc } from 'firebase/firestore'
import { resolveEnvFromProcess } from '../config/resolveEnv.js'

/*
 * One-off backfill for `users.birthdayKey`.
 *
 * The daily birthday job queries `where('birthdayKey', '==', 'MM-DD')`, because Firestore
 * cannot match a month and day inside the `YYYY-MM-DD` dob string. The app writes the key
 * whenever a profile is saved, so only users who have edited their profile since that
 * release have one. This fills it in for everyone else.
 *
 *   node scripts/backfillBirthdayKeys.mjs           # dry run — reports, writes nothing
 *   node scripts/backfillBirthdayKeys.mjs --apply   # actually write
 *   node scripts/backfillBirthdayKeys.mjs --apply --force   # also rewrite existing keys
 *
 * Safe to re-run: without --force it skips anyone who already has a key.
 */

// Which Firebase project this writes to comes from APP_ENV; unset means production.
const { name: appEnv, config: env } = resolveEnvFromProcess()
console.log(`[env] ${appEnv} — project ${env.firebase.projectId}`)

const app = initializeApp(env.firebase)
const db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const FORCE = args.includes('--force')

const monthDay = (d) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Must stay identical to birthdayKeyFrom in the app's utils/pushCampaigns.js.
 * A 'YYYY-MM-DD' string is sliced rather than parsed, because new Date('2002-06-07')
 * is UTC midnight and shifts the day in some timezones.
 */
function birthdayKeyFrom(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (ymd) return `${ymd[2]}-${ymd[3]}`
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '' : monthDay(parsed)
  }
  if (typeof value?.toDate === 'function') return monthDay(value.toDate())
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : monthDay(date)
}

async function main() {
  console.log(APPLY ? '>> APPLY mode — writing changes' : '>> DRY RUN — pass --apply to write')

  const snap = await getDocs(collection(db, 'users'))
  const stats = { total: snap.size, written: 0, already: 0, noDob: 0, unparsable: 0 }
  const samples = []

  for (const userDoc of snap.docs) {
    const data = userDoc.data() || {}

    if (data.birthdayKey && !FORCE) {
      stats.already += 1
      continue
    }
    const source = data.dob || data.dateOfBirth
    if (!source) {
      stats.noDob += 1
      continue
    }

    const key = birthdayKeyFrom(source)
    if (!key) {
      stats.unparsable += 1
      console.warn(`  unparsable dob on ${userDoc.id}:`, JSON.stringify(source))
      continue
    }

    if (samples.length < 5) samples.push(`${userDoc.id}: ${source} -> ${key}`)

    if (APPLY) {
      try {
        await setDoc(doc(db, 'users', userDoc.id), { birthdayKey: key }, { merge: true })
        stats.written += 1
      } catch (error) {
        console.error(`  write failed for ${userDoc.id}:`, error.message)
      }
    } else {
      stats.written += 1
    }
  }

  console.log('\nSamples:')
  samples.forEach((s) => console.log('  ' + s))
  console.log('\nResult:', JSON.stringify(stats, null, 2))
  if (!APPLY) console.log('\nNothing was written. Re-run with --apply.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
