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

export function createWorkerController(db) {
  return {
    async listWorkers(request, response) {
      const snapshot = await db.collection('workers').get()
      const workers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      response.json(filterWorkers(workers, request.query || {}))
    },

    async getWorker(request, response) {
      const workerDoc = await db.collection('workers').doc(request.params.workerId).get()

      if (!workerDoc.exists) {
        sendError(response, 404, 'Worker not found')
        return
      }

      const worker = { id: workerDoc.id, ...workerDoc.data() }
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
      const workerRef = db.collection('workers').doc(request.params.workerId)
      const workerDoc = await workerRef.get()
      const review = request.body || {}

      if (!workerDoc.exists) {
        sendError(response, 404, 'Worker not found')
        return
      }

      const current = { id: workerDoc.id, ...workerDoc.data() }

      if (review.action === 'approve' && !canApproveWorker(current)) {
        sendError(response, 400, 'Worker is missing required verification items')
        return
      }

      const updated = buildReviewUpdate(current, review)
      await workerRef.set(updated, { merge: true })
      response.json(updated)
    },

    async dashboard(request, response) {
      const snapshot = await db.collection('workers').get()
      const workers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      response.json(buildWorkerDashboard(workers, getRankingSettings(request.query || {})))
    },

    async rankedWorkers(request, response) {
      const snapshot = await db.collection('workers').get()
      const workers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
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
      const workerRef = db.collection('workers').doc(request.params.workerId)
      const workerDoc = await workerRef.get()

      if (!workerDoc.exists) {
        sendError(response, 404, 'Worker not found')
        return
      }

      const updates = normalizeWorkerPayload({
        ...workerDoc.data(),
        ...(request.body || {}),
        createdAt: workerDoc.data().createdAt,
      })

      await workerRef.set(updates, { merge: true })
      response.json({ id: workerDoc.id, ...updates })
    },

    async deleteWorker(request, response) {
      const workerRef = db.collection('workers').doc(request.params.workerId)
      const workerDoc = await workerRef.get()

      if (!workerDoc.exists) {
        sendError(response, 404, 'Worker not found')
        return
      }

      await workerRef.delete()
      response.status(204).end()
    },
  }
}
