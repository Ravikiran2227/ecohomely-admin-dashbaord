import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from './firebaseClient'
import { getPermissionsForRole, ROLES } from '../config/rbac'

const ADMIN_COLLECTIONS = [
  { name: 'admins', role: ROLES.SUPER_ADMIN },
  { name: 'managers', role: ROLES.ADMIN },
  { name: 'sub_managers', role: ROLES.SUB_ADMIN },
  { name: 'adminUsers', role: ROLES.ADMIN },
]

function normalizeRole(role, fallback) {
  const value = String(role || '').toLowerCase()
  if (value === 'super_admin' || value === 'super admin') return ROLES.SUPER_ADMIN
  if (value === 'manager' || value === 'admin') return ROLES.ADMIN
  if (value === 'sub_manager' || value.includes('sub')) return ROLES.SUB_ADMIN
  return fallback
}

function normalizeAdmin(docSnapshot, data, collectionName, fallbackRole) {
  const role = normalizeRole(data.role, fallbackRole)

  return {
    ...data,
    id: docSnapshot.id,
    username: data.username || data.email || '',
    name: data.name || data.displayName || data.username || data.email || 'Admin',
    email: data.email || '',
    role,
    status: data.status || 'Active',
    permissions: Array.isArray(data.permissions) && data.permissions.length > 0
      ? data.permissions
      : getPermissionsForRole(role),
    collectionName,
    lastActiveAt: new Date().toISOString(),
  }
}

async function findAdmin(username, password) {
  for (const source of ADMIN_COLLECTIONS) {
    const credentialsQuery = query(
      collection(db, source.name),
      where('username', '==', username),
      where('password', '==', password),
    )
    const snapshot = await getDocs(credentialsQuery)

    if (!snapshot.empty) {
      const docSnapshot = snapshot.docs[0]
      return normalizeAdmin(docSnapshot, docSnapshot.data(), source.name, source.role)
    }

    if (username.includes('@')) {
      const emailQuery = query(
        collection(db, source.name),
        where('email', '==', username),
        where('password', '==', password),
      )
      const emailSnapshot = await getDocs(emailQuery)

      if (!emailSnapshot.empty) {
        const docSnapshot = emailSnapshot.docs[0]
        return normalizeAdmin(docSnapshot, docSnapshot.data(), source.name, source.role)
      }
    }
  }

  return null
}

export async function loginAdmin(username, password) {
  const admin = await findAdmin(String(username || '').trim(), String(password || ''))

  if (!admin) {
    return { success: false, error: 'Invalid credentials' }
  }

  if (admin.locked === true || admin.locked === 'true' || admin.status === 'Blocked') {
    return { success: false, error: 'Account is locked. Contact admin to unlock account.' }
  }

  try {
    await updateDoc(doc(db, admin.collectionName, admin.id), { lastLogin: serverTimestamp() })
  } catch {
    // Firestore modular refs are handled below; keep login non-blocking if audit update fails.
  }

  return { success: true, user: admin }
}
