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

export const RBAC_AREAS = [
  'All Areas',
  'MVP Colony',
  'Dwaraka Nagar',
  'Madhurawada',
  'Beach Road',
  'Gajuwaka',
  'Pendurthi',
]

export const RBAC_CITIES = [
  'All Cities',
  'Visakhapatnam',
  'Guntur',
  'Vijayawada',
]

export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || []
}

export function roleHasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission)
}
