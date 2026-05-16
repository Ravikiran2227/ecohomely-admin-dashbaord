import { buildAdminUserPayload, generateTemporaryPassword, ROLE_PERMISSIONS, PERMISSIONS, sendCredentialsEmail } from '../services/rbacService.js'
import { ROLES } from '../services/rbacService.js'
import { sendError } from '../http.js'

export function createAdminController(db) {
  function adminCollection() {
    return db.collection('adminUsers')
  }

  function logsCollection() {
    return db.collection('activityLogs')
  }

  function docToJson(doc) {
    return { id: doc.id, ...doc.data() }
  }

  function getHeader(request, name) {
    return request.get?.(name) || request.headers?.[name.toLowerCase()]
  }

  function bearerToken(request) {
    const header = getHeader(request, 'authorization') || ''
    const match = String(header).match(/^Bearer\s+(.+)$/i)
    return match?.[1] || ''
  }

  function explicitAdminIdentity(request) {
    return {
      id: request.user?.id || getHeader(request, 'x-admin-user-id') || getHeader(request, 'x-user-id') || request.query?.adminUserId || request.query?.userId || '',
      email: request.user?.email || getHeader(request, 'x-admin-email') || getHeader(request, 'x-user-email') || request.query?.email || '',
      token: bearerToken(request),
    }
  }

  async function findAdminByEmail(email) {
    if (!email) return null

    const snapshot = await adminCollection().where('email', '==', email).limit(1).get()
    return snapshot.empty ? null : docToJson(snapshot.docs[0])
  }

  async function resolveCurrentUser(request) {
    if (request.user?.id && request.user?.role) return request.user

    const identity = explicitAdminIdentity(request)
    const candidateIds = [identity.id, identity.token].filter(Boolean)

    for (const candidateId of candidateIds) {
      const userDoc = await adminCollection().doc(candidateId).get()
      if (userDoc.exists) return docToJson(userDoc)
    }

    const emailMatch = await findAdminByEmail(identity.email)
    if (emailMatch) return emailMatch

    const snapshot = await adminCollection().get()
    const users = snapshot.docs.map(docToJson)

    return users.find((user) => user.status === 'Active' && user.role === ROLES.SUPER_ADMIN)
      || users.find((user) => user.status === 'Active')
      || users[0]
      || null
  }

  async function writeActivityLog(request, { action, module, description, targetId = '' }) {
    const actor = await resolveCurrentUser(request)
    const payload = {
      actorId: actor?.id || 'system',
      actorRole: actor?.role || 'System',
      user_id: actor?.id || 'system',
      user_type: actor?.role || 'System',
      action,
      module,
      description,
      targetId,
      createdAt: new Date().toISOString(),
    }

    const logRef = await logsCollection().add(payload)
    return { id: logRef.id, ...payload }
  }

  return {
    async listUsers(request, response) {
      const snapshot = await adminCollection().get()
      response.json(snapshot.docs.map(docToJson))
    },

    async getUser(request, response) {
      const userDoc = await adminCollection().doc(request.params.userId).get()

      if (!userDoc.exists) {
        sendError(response, 404, 'Admin user not found')
        return
      }

      response.json({ id: userDoc.id, ...userDoc.data() })
    },

    async createUser(request, response) {
      const payload = buildAdminUserPayload(request.body || {})

      if (!payload.name || !payload.email) {
        sendError(response, 400, 'Name and email are required')
        return
      }

      const temporaryPassword = generateTemporaryPassword()
      const userRef = await adminCollection().add(payload)
      const emailResult = await sendCredentialsEmail({
        email: payload.email,
        name: payload.name,
        password: temporaryPassword,
      })

      await writeActivityLog(request, {
        action: 'Create Admin User',
        description: `Created ${payload.role} user ${payload.name} for ${payload.city}/${payload.area}`,
        module: 'Admin Access',
        targetId: userRef.id,
      })

      response.status(201).json({
        id: userRef.id,
        ...payload,
        credentials: {
          email: payload.email,
          temporaryPassword,
          emailDelivery: emailResult,
        },
      })
    },

    async updateUser(request, response) {
      const userRef = adminCollection().doc(request.params.userId)
      const userDoc = await userRef.get()

      if (!userDoc.exists) {
        sendError(response, 404, 'Admin user not found')
        return
      }

      const updates = buildAdminUserPayload({
        ...userDoc.data(),
        ...(request.body || {}),
        createdAt: userDoc.data().createdAt,
      })

      await userRef.set(updates, { merge: true })
      await writeActivityLog(request, {
        action: 'Update Admin User',
        description: `Updated ${updates.name || request.params.userId} access settings.`,
        module: 'Admin Access',
        targetId: request.params.userId,
      })
      response.json({ id: userDoc.id, ...updates })
    },

    async deleteUser(request, response) {
      const userRef = adminCollection().doc(request.params.userId)
      const userDoc = await userRef.get()

      if (!userDoc.exists) {
        sendError(response, 404, 'Admin user not found')
        return
      }

      const user = userDoc.data()
      await userRef.delete()
      await writeActivityLog(request, {
        action: 'Delete Admin User',
        description: `Removed ${user.name || request.params.userId} from admin access.`,
        module: 'Admin Access',
        targetId: request.params.userId,
      })
      response.status(204).end()
    },

    async activityLogs(request, response) {
      const snapshot = await logsCollection().orderBy('createdAt', 'desc').limit(100).get()
      response.json(snapshot.docs.map(docToJson))
    },

    async createActivityLog(request, response) {
      const { action, module, description } = request.body || {}

      if (!action || !module || !description) {
        sendError(response, 400, 'Action, module, and description are required')
        return
      }

      const payload = await writeActivityLog(request, {
        action,
        description,
        module,
        targetId: request.body?.targetId || '',
      })
      response.status(201).json(payload)
    },

    async roles(request, response) {
      response.json({
        permissions: PERMISSIONS,
        roles: Object.values(ROLES),
        rolePermissions: ROLE_PERMISSIONS,
      })
    },

    async currentUser(request, response) {
      const user = await resolveCurrentUser(request)

      if (!user) {
        sendError(response, 401, 'Authenticated admin user is required')
        return
      }

      response.json(user)
    },

    async updateCurrentUser(request, response) {
      const currentUser = await resolveCurrentUser(request)

      if (!currentUser?.id) {
        sendError(response, 401, 'Authenticated admin user is required')
        return
      }

      const userRef = adminCollection().doc(currentUser.id)
      const userDoc = await userRef.get()

      if (!userDoc.exists) {
        sendError(response, 404, 'Admin user not found')
        return
      }

      const updates = buildAdminUserPayload({
        ...userDoc.data(),
        ...(request.body || {}),
        createdAt: userDoc.data().createdAt,
      })

      await userRef.set(updates, { merge: true })
      response.json({ id: userDoc.id, ...updates })
    },
  }
}
