import { hasPermission } from '../services/rbacService.js'

export function requireRole(allowedRoles = []) {
  return (request, response, next) => {
    const role = request.user?.role

    if (!role || !allowedRoles.includes(role)) {
      response.status(403).json({ message: 'Access denied for this role' })
      return
    }

    next()
  }
}

export function requirePermission(permission) {
  return (request, response, next) => {
    const role = request.user?.role

    if (!role || !hasPermission(role, permission)) {
      response.status(403).json({ message: 'Missing required permission' })
      return
    }

    next()
  }
}
