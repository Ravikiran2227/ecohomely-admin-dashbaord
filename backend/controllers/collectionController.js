import { sendError } from '../http.js'

function docToJson(doc) {
  return { id: doc.id, ...doc.data() }
}

function applyFilters(items = [], filters = {}) {
  return items.filter((item) => (
    Object.entries(filters).every(([key, value]) => {
      if (value === undefined || value === null || value === '') return true
      return String(item[key] ?? '') === String(value)
    })
  ))
}

function withTimestamps(payload = {}, { create = false } = {}) {
  const now = new Date().toISOString()

  return {
    ...payload,
    ...(create && !payload.createdAt ? { createdAt: now } : {}),
    updatedAt: now,
  }
}

export function createCollectionController(db, collectionName, options = {}) {
  const {
    filterFields = [],
    listOrderBy = 'createdAt',
    listOrderDirection = 'desc',
    requiredCreateFields = [],
  } = options

  return {
    async list(request, response) {
      const snapshot = await db.collection(collectionName).get()
      const filters = Object.fromEntries(
        filterFields
          .filter((field) => request.query?.[field] !== undefined)
          .map((field) => [field, request.query[field]])
      )
      const items = applyFilters(snapshot.docs.map(docToJson), filters)

      response.json(items.sort((left, right) => {
        const leftValue = left[listOrderBy] || ''
        const rightValue = right[listOrderBy] || ''
        return listOrderDirection === 'asc'
          ? String(leftValue).localeCompare(String(rightValue))
          : String(rightValue).localeCompare(String(leftValue))
      }))
    },

    async get(request, response) {
      const record = await db.collection(collectionName).doc(request.params.id).get()

      if (!record.exists) {
        sendError(response, 404, `${options.label || 'Record'} not found`)
        return
      }

      response.json(docToJson(record))
    },

    async create(request, response) {
      const missing = requiredCreateFields.filter((field) => request.body?.[field] === undefined || request.body?.[field] === '')

      if (missing.length > 0) {
        sendError(response, 400, `Missing required fields: ${missing.join(', ')}`, { missing })
        return
      }

      const payload = withTimestamps(request.body || {}, { create: true })
      const recordRef = await db.collection(collectionName).add(payload)
      response.status(201).json({ id: recordRef.id, ...payload })
    },

    async update(request, response) {
      const recordRef = db.collection(collectionName).doc(request.params.id)
      const record = await recordRef.get()

      if (!record.exists) {
        sendError(response, 404, `${options.label || 'Record'} not found`)
        return
      }

      const updates = withTimestamps(request.body || {})
      await recordRef.set(updates, { merge: true })
      response.json({ id: record.id, ...record.data(), ...updates })
    },

    async remove(request, response) {
      const recordRef = db.collection(collectionName).doc(request.params.id)
      const record = await recordRef.get()

      if (!record.exists) {
        sendError(response, 404, `${options.label || 'Record'} not found`)
        return
      }

      await recordRef.delete()
      response.status(204).end()
    },
  }
}
