import { initializeApp } from 'firebase/app'
import { collection, doc, getDocs, query, setDoc, where, initializeFirestore, deleteField } from 'firebase/firestore'

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

// Usage: node scripts/phoneReverification.mjs --email=test@example.com --message="Please re-verify..." [--remove]
const args = process.argv.slice(2)
function getArg(name, fallback='') {
  const pref = `--${name}=`
  const hit = args.find(a=>a.startsWith(pref))
  if (hit) return hit.slice(pref.length)
  const idx = args.indexOf(`--${name}`)
  if (idx!==-1 && args[idx+1] && !args[idx+1].startsWith('--')) return args[idx+1]
  return fallback
}
const email = (getArg('email') || args[0] || '').trim()
const message = getArg('message', 'Please re-verify your mobile number: open Ecohomely app → Profile → Edit Phone → Enter number → Verify OTP. Your services need a verified phone.')
const title = getArg('title', 'Mobile verification required')
const shouldRemove = args.includes('--remove') || args.includes('--clear')

if (!email) {
  console.error('Usage: node scripts/phoneReverification.mjs --email=prakashbatthala@gmail.com [--message=\"...\"] [--remove]')
  console.error('Note: email typo in request was prakashbathala@gmail.com — use prakashbatthala@gmail.com (with t)')
  process.exit(1)
}

async function findUserByEmail(targetEmail) {
  const q = query(collection(db,'users'), where('email','==', targetEmail))
  const snap = await getDocs(q)
  if (!snap.empty) return snap.docs[0]
  // case-insensitive fallback scan (293 docs without phone etc.)
  const all = await getDocs(collection(db,'users'))
  for (const docSnap of all.docs) {
    if ((docSnap.data().email||'').trim().toLowerCase() === targetEmail.toLowerCase()) return docSnap
  }
  return null
}

const userDoc = await findUserByEmail(email)
if (!userDoc) {
  console.error(`No users doc found for email ${email}`)
  // also check customers alias
  const q2 = query(collection(db,'customers'), where('email','==', email))
  const s2 = await getDocs(q2)
  console.log('customers alias found', s2.size)
  process.exit(1)
}

const userId = userDoc.id
const userData = userDoc.data()
console.log(`Found ${userId} name=${userData.name} email=${userData.email} phone=${userData.phone||'MISSING'}`)

if (shouldRemove) {
  await setDoc(doc(db,'users',userId), {
    phoneVerificationRequest: deleteField(),
    userAppPopup: deleteField(),
    partnerAppPopup: deleteField(),
    phone_reverification: deleteField(),
    latestToLetNotification: deleteField(),
  }, { merge:true })
  // also clear from customers alias if exists
  try { await setDoc(doc(db,'customers',userId), {
    phoneVerificationRequest: deleteField(),
    userAppPopup: deleteField(),
    partnerAppPopup: deleteField(),
  }, { merge:true }) } catch {}
  console.log(`Cleared verification banner for ${userId}`)
  process.exit(0)
}

const now = new Date()
const payload = {
  type: 'phone_reverification',
  title,
  message,
  requestedAt: now.toISOString(),
  requestedAtMs: now.getTime(),
  read: false,
  targetEmail: email,
  // user app should use this to force OTP screen
  action: 'open_phone_otp',
  ctaLabel: 'Verify now',
}

const updates = {
  phoneVerificationRequest: payload,
  phone_reverification: payload, // legacy key some apps check
  userAppPopup: { ...payload, type:'phone_correction' },
  partnerAppPopup: { ...payload, type:'phone_correction' },
  updatedAt: now.toISOString(),
  // also create a notification doc so banner list shows
}

await setDoc(doc(db,'users',userId), updates, { merge:true })
try { await setDoc(doc(db,'customers',userId), updates, { merge:true }) } catch {}

 // also add to notifications subcollection for history
try {
  const { addDoc } = await import('firebase/firestore')
  await addDoc(collection(db,'users',userId,'notifications'), {
    ...payload,
    userId,
    createdAt: now,
  })
} catch {}

console.log(`Sent phone re-verification banner to ${userId} (${email})`)
console.log('Payload:', JSON.stringify(payload,null,2))
console.log('User app will show banner on next foreground if it watches users/{uid}.userAppPopup / phoneVerificationRequest')
console.log('To remove after number captured: node scripts/phoneReverification.mjs --email='+email+' --remove')
process.exit(0)
