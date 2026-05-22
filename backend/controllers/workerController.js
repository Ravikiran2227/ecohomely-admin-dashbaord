import { buildReviewUpdate, buildVerificationChecklist, canApproveWorker } from '../services/verificationService.js'
import { buildWorkerDashboard, defaultRankingSettings, filterWorkers, normalizeWorkerPayload, rankWorkers } from '../services/workerService.js'
import { sendError } from '../http.js'

function getRankingSettings(query = {}) {
  return {
    ...defaultRankingSettings,
    ...Object.fromEntries(
      Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => [key, Number(value)])
        .filter(([, value]) => !Number.isNaN(value))
    ),
  }
}

async function listWorkerRecords(db) {
  const snapshots = await Promise.all([
    db.collection('workers').get().catch(() => ({ docs: [] })),
    db.collection('servicemen').get().catch(() => ({ docs: [] })),
  ])
  const byId = new Map()

  snapshots.flatMap((snapshot) => snapshot.docs).forEach((doc) => {
    byId.set(doc.id, { ...(byId.get(doc.id) || {}), id: doc.id, ...doc.data() })
  })

  return [...byId.values()]
}

async function findWorkerRecord(db, workerId) {
  for (const collectionName of ['workers', 'servicemen']) {
    const ref = db.collection(collectionName).doc(workerId)
    const doc = await ref.get()
    if (doc.exists) return { ref, doc, collectionName }
  }

  return null
}

export function createWorkerController(db) {
  return {
    async listWorkers(request, response) {
      const workers = await listWorkerRecords(db)
      response.json(filterWorkers(workers, request.query || {}))
    },

    async getWorker(request, response) {
      const record = await findWorkerRecord(db, request.params.workerId)

      if (!record) {
        sendError(response, 404, 'Worker not found')
        return
      }

      const worker = { id: record.doc.id, ...record.doc.data() }
      response.json({
        ...worker,
        verificationChecklist: buildVerificationChecklist(worker),
      })
    },

    async submitOnboarding(request, response) {
      const payload = normalizeWorkerPayload(request.body || {})

      if ((payload.professions || []).length === 0) {
        sendError(response, 400, 'Primary profession is required')
        return
      }

      if ((payload.professions || []).length > 2) {
        sendError(response, 400, 'Maximum 2 professions are allowed')
        return
      }

      const workerRef = await db.collection('workers').add(payload)
      response.status(201).json({ id: workerRef.id, ...payload })
    },

    async reviewWorker(request, response) {
      const record = await findWorkerRecord(db, request.params.workerId)
      const review = request.body || {}

      if (!record) {
        sendError(response, 404, 'Worker not found')
        return
      }

      const current = { id: record.doc.id, ...record.doc.data() }

      if (review.action === 'approve' && !canApproveWorker(current)) {
        sendError(response, 400, 'Worker is missing required verification items')
        return
      }

      const updated = buildReviewUpdate(current, review)
      await record.ref.set(updated, { merge: true })
      response.json(updated)
    },

    async dashboard(request, response) {
      const workers = await listWorkerRecords(db)
      response.json(buildWorkerDashboard(workers, getRankingSettings(request.query || {})))
    },

    async rankedWorkers(request, response) {
      const workers = await listWorkerRecords(db)
      const settings = getRankingSettings(request.query || {})
      response.json({
        settings,
        workers: rankWorkers(filterWorkers(workers, request.query || {}), settings),
      })
    },

    async rankingSettings(request, response) {
      response.json(defaultRankingSettings)
    },

    async createWorker(request, response) {
      const payload = normalizeWorkerPayload(request.body || {})

      if (!payload.name || !payload.phone) {
        sendError(response, 400, 'Name and phone are required')
        return
      }

      const workerRef = await db.collection('workers').add(payload)
      response.status(201).json({ id: workerRef.id, ...payload })
    },

    async updateWorker(request, response) {
      const record = await findWorkerRecord(db, request.params.workerId)

      if (!record) {
        sendError(response, 404, 'Worker not found')
        return
      }

      const updates = normalizeWorkerPayload({
        ...record.doc.data(),
        ...(request.body || {}),
        createdAt: record.doc.data().createdAt,
      })

      await record.ref.set(updates, { merge: true })
      response.json({ id: record.doc.id, ...updates })
    },

    async deleteWorker(request, response) {
      const record = await findWorkerRecord(db, request.params.workerId)

      if (!record) {
        sendError(response, 404, 'Worker not found')
        return
      }

      await record.ref.delete()
      response.status(204).end()
    },
  }
}
