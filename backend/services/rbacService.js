export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  SUB_ADMIN: 'Sub Admin / Employee',
}

export const PERMISSIONS = {
  manageAdmins: 'manage_admins',
  manageWorkers: 'manage_workers',
  manageBookings: 'manage_bookings',
  manageComplaints: 'manage_complaints',
  managePayments: 'manage_payments',
  viewSettings: 'view_settings',
  viewDashboard: 'view_dashboard',
  viewActivityLogs: 'view_activity_logs',
}

export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.SUB_ADMIN]: [
    PERMISSIONS.viewDashboard,
    PERMISSIONS.manageBookings,
    PERMISSIONS.manageComplaints,
    PERMISSIONS.viewActivityLogs,
  ],
}

export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || []
}

export function hasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission)
}

export function generateTemporaryPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function buildAdminUserPayload(payload = {}) {
  return {
    name: payload.name || '',
    email: payload.email || '',
    role: payload.role || ROLES.SUB_ADMIN,
    city: payload.city || 'Visakhapatnam',
    area: payload.area || 'All Areas',
    status: payload.status || 'Invited',
    permissions: getPermissionsForRole(payload.role || ROLES.SUB_ADMIN),
    assignedModules: getPermissionsForRole(payload.role || ROLES.SUB_ADMIN),
    createdAt: payload.createdAt || new Date().toISOString(),
    lastActiveAt: payload.lastActiveAt || null,
  }
}

export async function sendCredentialsEmail({ email, name, password }) {
  return {
    ok: true,
    channel: 'email',
    recipient: email,
    message: `Credentials queued for ${name}`,
    temporaryPassword: password,
  }
}
