import { initializeApp } from 'firebase/app'
import { doc, initializeFirestore, setDoc } from 'firebase/firestore'

/*
 * One-off seed for the Instant Services catalog.
 *
 *   node scripts/seedInstantServices.mjs          # write anything missing
 *   node scripts/seedInstantServices.mjs --force  # overwrite existing docs
 *
 * After this runs the catalog is editable from Admin → Instant Services, and
 * both the app (display) and the Cloud Function (what it charges) read these
 * documents, so the price can never be changed in one place only.
 */

const firebaseConfig = {
  apiKey: 'AIzaSyA0BSrwXFoBeMvdN4efvfJqHRQarNbZap4',
  authDomain: 'ecohomely-app.firebaseapp.com',
  projectId: 'ecohomely-app',
  storageBucket: 'ecohomely-app.firebasestorage.app',
  messagingSenderId: '820094665311',
  appId: '1:820094665311:web:51105fe59b5fc6a40211ea',
}
const app = initializeApp(firebaseConfig)
const db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false })

const force = process.argv.slice(2).includes('--force')
const now = new Date().toISOString()

const PROFESSIONS = [
  {
    id: 'cleaning',
    professionValue: 'Cleaning',
    title: 'Cleaning',
    contextLabel: 'Your service',
    imageUrl: '',
    active: true,
    sortOrder: 1,
  },
]

const PACKS = [
  {
    id: 'bathroom-single',
    professionId: 'cleaning',
    professionValue: 'Cleaning',
    section: 'Bathroom Cleaning',
    sectionOrder: 1,
    label: 'Single Bathroom Cleaning',
    price: 249,
    pricePaise: 24900,
    description:
      'Covers one bathroom end to end: floor and wall tiles scrubbed, sanitaryware disinfected and fittings wiped down, with the area left dry and ready to use.',
    inclusions: [
      'Floor and wall tile scrubbing',
      'Toilet seat and commode sanitisation',
      'Washbasin, mirror and fittings cleaning',
    ],
    duration: '40–50 mins',
    warranty: '',
    imageUrl: '',
    media: [],
    expectation: {
      caption: 'Worker scrubs tiles and sanitaryware, disinfects the toilet, then wipes fittings dry.',
      posterUrl: '',
      videoUrl: '',
      duration: '',
    },
    active: true,
    sortOrder: 1,
  },
  {
    id: 'bathroom-deep',
    professionId: 'cleaning',
    professionValue: 'Cleaning',
    section: 'Bathroom Cleaning',
    sectionOrder: 1,
    label: 'Deep Bathroom Cleaning',
    price: 499,
    pricePaise: 49900,
    description:
      'A full deep clean: grout and hard-water stains treated, sanitaryware descaled, and the exhaust and drain cleared, finished with a polish on taps and fittings.',
    inclusions: [
      'Deep scrubbing of floor, walls and grout',
      'Toilet, commode and cistern descaling',
      'Washbasin, mirror, taps and fittings polish',
      'Exhaust fan and drain cleaning',
    ],
    duration: '90–120 mins',
    warranty: '',
    imageUrl: '',
    media: [],
    expectation: {
      caption:
        'Worker treats grout and hard-water stains, descales the sanitaryware, clears the exhaust and drain, then polishes fittings.',
      posterUrl: '',
      videoUrl: '',
      duration: '',
    },
    active: true,
    sortOrder: 2,
  },
]

const CONFIG = {
  // One-hour slots, named by start hour (24h).
  slotHours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
  // Lead time Ecohomely needs to assign someone before a slot can be booked.
  bufferHours: 4,
  // How far ahead "Pick a date" allows.
  bookingDays: 14,
  cancellationNote: 'Free to cancel before a partner is assigned — charges may apply after.',
}

async function write(path, id, data) {
  const ref = doc(db, path, id)
  await setDoc(ref, { ...data, updatedAt: now }, { merge: !force })
  console.log(`${force ? 'overwrote' : 'wrote  '} ${path}/${id}`)
}

async function main() {
  for (const { id, ...rest } of PROFESSIONS) await write('instantServiceProfessions', id, rest)
  for (const { id, ...rest } of PACKS) await write('instantServicePacks', id, rest)
  await write('instantConfig', 'settings', CONFIG)
  console.log('\nDone. Edit these from Admin → Instant Services.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
