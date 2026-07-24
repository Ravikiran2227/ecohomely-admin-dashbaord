import { initializeApp } from 'firebase/app'
import { doc, getDoc, initializeFirestore, Timestamp } from 'firebase/firestore'

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

function describe(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (v instanceof Timestamp) return 'NATIVE Timestamp (has toDate)'
  if (Array.isArray(v)) return `array[${v.length}]`
  if (typeof v === 'object') {
    const hasToDate = typeof v.toDate === 'function'
    return `plain-object{${Object.keys(v).join(',')}}${hasToDate ? ' (has toDate)' : ' (NO toDate)'}`
  }
  return `${typeof v}: ${JSON.stringify(v)}`
}

const snap = await getDoc(doc(db, 'users', 'user_1780745379514'))
if (!snap.exists()) { console.log('doc not found'); process.exit(0) }
const d = snap.data()

console.log('TOP-LEVEL timestamp-ish fields:')
for (const f of ['lastSeen', 'updatedAt', 'createdAt', 'dob']) console.log(`  ${f}: ${describe(d[f])}`)

const popupFields = [
  'userAppPopup', 'partnerAppPopup', 'toLetListingPopup', 'propertyAppPopup',
  'listingCorrectionRequest', 'toLetCorrectionRequest', 'propertyListingCorrectionRequest',
  'latestToLetNotification',
]
console.log('\nPOPUP/CORRECTION objects and their nested timestamps:')
for (const f of popupFields) {
  const obj = d[f]
  if (obj === undefined) { console.log(`  ${f}: <absent>`); continue }
  console.log(`  ${f}: ${describe(obj)}`)
  if (obj && typeof obj === 'object') {
    for (const nf of ['requestedAt', 'createdAt', 'sentAt', 'expiresAt']) {
      if (obj[nf] !== undefined) console.log(`      .${nf}: ${describe(obj[nf])}`)
    }
    if (obj.correctionRequest) {
      console.log(`      .correctionRequest: ${describe(obj.correctionRequest)}`)
      for (const nf of ['requestedAt', 'createdAt']) {
        if (obj.correctionRequest[nf] !== undefined) console.log(`          .correctionRequest.${nf}: ${describe(obj.correctionRequest[nf])}`)
      }
    }
  }
}
process.exit(0)
