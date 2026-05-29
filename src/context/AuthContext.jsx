import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPermissionsForRole, ROLE_PERMISSIONS, ROLES } from '../config/rbac'
import adminApi from '../services/adminApi'
import { loginAdmin } from '../services/adminAuth'
import { AuthContext } from './authContextValue'

function makeId(prefix) {
  return `${prefix}-${Date.now()}`
}

function formatTimestamp(value) {
  if (!value) return ''
  if (typeof value.toDate === 'function') value = value.toDate()
  if (typeof value.toMillis === 'function') value = new Date(value.toMillis())
  if (value._seconds || value.seconds) value = new Date((value._seconds || value.seconds) * 1000)
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'Not recorded'
    return value.toISOString().slice(0, 16).replace('T', ' ')
  }
  if (typeof value === 'object') {
    const secondsMatch = String(value).match(/seconds=(\d+)/)
    if (secondsMatch) value = new Date(Number(secondsMatch[1]) * 1000)
    else return 'Not recorded'
  }
  if (typeof value === 'string' && value.includes(' ') && !value.includes('T')) return value

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'

  return date.toISOString().slice(0, 16).replace('T', ' ')
}

function labelize(value = '') {
  return String(value || 'Activity')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function moduleFromActivity(type = '') {
  const value = String(type).toLowerCase()
  if (value.includes('customer')) return 'Customers'
  if (value.includes('worker') || value.includes('serviceman')) return 'Workers'
  if (value.includes('booking')) return 'Bookings'
  if (value.includes('complaint')) return 'Complaints'
  if (value.includes('admin') || value.includes('user')) return 'Admin Access'
  if (value.includes('coupon')) return 'Coupons'
  if (value.includes('notification')) return 'Notifications'
  return 'System'
}

function describeLog(log = {}, details = {}) {
  if (log.description) return String(log.description)

  const action = labelize(log.activityType || log.action)
  const targetName = details.customerName || details.workerName || details.bookingId || details.customerId || details.workerId || ''
  const actor = details.userName || details.username || log.userName || log.username || 'System'
  const severity = details.severity ? ` Severity: ${details.severity}.` : ''

  return targetName
    ? `${actor} performed ${action} for ${targetName}.${severity}`
    : `${actor} performed ${action}.${severity}`
}

function moduleNamesForRole(role) {
  return getPermissionsForRole(role).map((permission) => permission.replace('manage_', '').replace('view_', '').replaceAll('_', ' '))
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase()
  if (value === 'super_admin' || value === 'super admin') return ROLES.SUPER_ADMIN
  if (value === 'manager' || value === 'admin') return ROLES.ADMIN
  if (value === 'sub_manager' || value === 'sub manager' || value.includes('sub')) return ROLES.SUB_ADMIN
  return role || ROLES.SUB_ADMIN
}

function normalizeStatus(user = {}) {
  if (user.status) return user.status
  if (user.isActive === false || user.active === false || user.locked === true || user.locked === 'true') return 'Inactive'
  return 'Active'
}

function normalizeUser(user = {}) {
  const role = normalizeRole(user.role)

  return {
    ...user,
    id: user.id || user.uid || user.email || makeId('ADM'),
    username: user.username || user.userName || user.email || '',
    name: user.name || user.displayName || user.username || user.userName || user.email || 'Admin',
    email: user.email || '',
    role,
    rawRole: user.role,
    city: user.city || 'Visakhapatnam',
    area: user.area || 'All Areas',
    status: normalizeStatus(user),
    permissions: user.permissions || getPermissionsForRole(role),
    assignedModules: user.assignedModules || moduleNamesForRole(role),
    lastActiveAt: formatTimestamp(user.lastActiveAt || user.lastLogin || user.updatedDate || user.createdDate) || 'Not recorded',
  }
}

function normalizeLog(log = {}) {
  const details = log.details || {}
  const action = log.action || log.activityType || 'Activity'
  const actorRole = log.user_type || log.actorRole || log.role || log.userRole || details.userRole || 'System'
  const actorId = log.user_id || log.actorId || log.userId || details.userId || details.username || 'system'

  return {
    ...log,
    id: log.id || makeId('LOG'),
    details,
    user_type: normalizeRole(actorRole),
    user_id: actorId,
    action: labelize(action),
    module: log.module || moduleFromActivity(action),
    description: describeLog(log, details),
    timestamp: formatTimestamp(details.timestamp || log.timestamp || log.createdAt || log.updatedAt || new Date().toISOString()),
  }
}

function normalizeRoleData(payload) {
  if (Array.isArray(payload)) {
    return payload.reduce((acc, role) => ({ ...acc, [role]: getPermissionsForRole(role) }), {})
  }

  return payload?.rolePermissions || payload?.roles || payload || ROLE_PERMISSIONS
}

export function AuthProvider({ children }) {
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [activityLogs, setActivityLogs] = useState([])
  const [roles, setRoles] = useState(ROLE_PERMISSIONS)
  const [loading, setLoading] = useState(true)
  const [usersLoading, setUsersLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)
  const [error, setError] = useState('')
  const [unauthorized, setUnauthorized] = useState(false)

  const persistUser = useCallback((user) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('adminUser', JSON.stringify(user))
    window.sessionStorage.setItem('currentAdminUserId', user.id)
  }, [])

  const clearPersistedUser = useCallback(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem('adminUser')
    window.sessionStorage.removeItem('currentAdminUserId')
  }, [])

  const refreshActivityLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const logs = await adminApi.getActivityLogs()
      setActivityLogs((logs || []).map(normalizeLog))
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const refreshUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const nextUsers = await adminApi.listUsers()
      setUsers((nextUsers || []).map(normalizeUser))
    } finally {
      setUsersLoading(false)
    }
  }, [])

  const refreshAuth = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const storedUser = typeof window !== 'undefined' ? window.localStorage.getItem('adminUser') : ''
      const parsedUser = storedUser ? normalizeUser(JSON.parse(storedUser)) : null
      const rolePayload = await adminApi.getRoles()

      setCurrentUser(parsedUser)
      setRoles(normalizeRoleData(rolePayload))
      setUnauthorized(!parsedUser)

      if (parsedUser) {
        await Promise.all([
          refreshUsers(),
          refreshActivityLogs(),
        ])
      } else {
        setUsers([])
        setActivityLogs([])
        setUsersLoading(false)
        setLogsLoading(false)
      }
    } catch (nextError) {
      setCurrentUser(null)
      setUnauthorized(true)
      setError(nextError.message || 'Unable to load admin auth data.')
      setUsers([])
      setActivityLogs([])
      setUsersLoading(false)
      setLogsLoading(false)
    } finally {
      setLoading(false)
    }
  }, [refreshActivityLogs, refreshUsers])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  const logActivity = useCallback(async ({ action, module, description }) => {
    if (!currentUser) return

    const optimisticLog = normalizeLog({
      actorRole: currentUser.role,
      actorId: currentUser.id,
      action,
      module,
      description,
      createdAt: new Date().toISOString(),
    })

    setActivityLogs((current) => [optimisticLog, ...current])

    try {
      await adminApi.createActivityLog({ action, module, description })
      await refreshActivityLogs()
    } catch {
      // Keep the UI responsive for modules that log incidental activity.
    }
  }, [currentUser, refreshActivityLogs])

  const createUser = useCallback(async (payload) => {
    const result = await adminApi.createUser(payload)
    const newUser = normalizeUser(result)

    setUsers((current) => [newUser, ...current])
    await refreshActivityLogs()

    return {
      newUser,
      generatedPassword: result?.credentials?.temporaryPassword || result?.temporaryPassword || result?.password || payload?.password || '',
    }
  }, [refreshActivityLogs])

  const updateUser = useCallback(async (userId, updates) => {
    const updatedUser = normalizeUser(await adminApi.updateUser(userId, updates))

    setUsers((current) => current.map((user) => (user.id === userId ? updatedUser : user)))
    if (currentUser?.id === userId) {
      setCurrentUser(updatedUser)
    }
    await refreshActivityLogs()
  }, [currentUser?.id, refreshActivityLogs])

  const deleteUser = useCallback(async (userId) => {
    await adminApi.deleteUser(userId)
    setUsers((current) => current.filter((user) => user.id !== userId))
    await refreshActivityLogs()

    if (currentUser?.id === userId) {
      setCurrentUser(null)
      setUnauthorized(true)
    }
  }, [currentUser?.id, refreshActivityLogs])

  const switchUser = useCallback(async (userId) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('currentAdminUserId', userId)
    }

    const user = normalizeUser(await adminApi.getUser(userId))
    setCurrentUser(user)
    setUnauthorized(false)
  }, [])

  const login = useCallback(async (username, password) => {
    setError('')
    const result = await loginAdmin(username, password)

    if (!result.success) {
      setUnauthorized(true)
      setError(result.error || 'Invalid credentials')
      return result
    }

    const user = normalizeUser(result.user)
    persistUser(user)
    setCurrentUser(user)
    setUnauthorized(false)
    await Promise.all([
      refreshUsers(),
      refreshActivityLogs(),
    ])

    return { success: true, user }
  }, [persistUser, refreshActivityLogs, refreshUsers])

  const logout = useCallback(() => {
    clearPersistedUser()
    setCurrentUser(null)
    setUnauthorized(true)
    setUsers([])
    setActivityLogs([])
  }, [clearPersistedUser])

  const hasPermission = useCallback((permission) => {
    if (!currentUser) return false
    if (Array.isArray(currentUser.permissions)) return currentUser.permissions.includes(permission)

    return (roles[currentUser.role] || getPermissionsForRole(currentUser.role)).includes(permission)
  }, [currentUser, roles])

  const value = useMemo(() => ({
    users,
    currentUser,
    activityLogs,
    roles,
    availableRoles: Object.values(ROLES),
    loading,
    usersLoading,
    logsLoading,
    error,
    unauthorized,
    refreshAuth,
    refreshUsers,
    refreshActivityLogs,
    login,
    logout,
    switchUser,
    createUser,
    updateUser,
    deleteUser,
    logActivity,
    hasPermission,
  }), [activityLogs, createUser, currentUser, deleteUser, error, hasPermission, loading, logActivity, login, logout, logsLoading, refreshActivityLogs, refreshAuth, refreshUsers, roles, switchUser, unauthorized, updateUser, users, usersLoading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
