import { clusterCoverageSummary, getClustersByLocation } from '../services/clusterService.js'
import { buildHeatmapZones, mapWorkerCoverage } from '../services/workerLocationService.js'
import { sendError } from '../http.js'

function docToJson(doc) {
  return { id: doc.id, ...doc.data() }
}

function withTimestamps(payload = {}, { create = false } = {}) {
  const now = new Date().toISOString()
  return {
    ...payload,
    ...(create && !payload.createdAt ? { createdAt: now } : {}),
    updatedAt: now,
  }
}

function normalizeAreaNamePayload(payload = {}, { create = false } = {}) {
  const name = String(payload.name || payload.areaName || payload.title || '').trim()
  const nextPayload = {
    ...payload,
    active: payload.active ?? true,
  }

  if (create || name) {
    nextPayload.name = name
    nextPayload.areaName = payload.areaName || name
  }

  return withTimestamps(nextPayload, { create })
}

export function createLocationController(db) {
  async function getHierarchy() {
    const [states, districts, cities, mandals, areas] = await Promise.all([
      db.collection('states').get(),
      db.collection('districts').get(),
      db.collection('cities').get(),
      db.collection('mandals').get(),
      db.collection('areas').get(),
    ])

    return {
      states: states.docs.map(docToJson),
      districts: districts.docs.map(docToJson),
      cities: cities.docs.map(docToJson),
      mandals: mandals.docs.map(docToJson),
      areas: areas.docs.map(docToJson),
    }
  }

  return {
    async listHierarchy(request, response) {
      response.json(await getHierarchy())
    },

    async listClusters(request, response) {
      const filters = request.query || {}
      const [clusterSnapshot, citySnapshot] = await Promise.all([
        db.collection('clusters').get(),
        db.collection('cities').get(),
      ])

      const clusters = clusterSnapshot.docs.map(docToJson)
      const cities = citySnapshot.docs.map(docToJson)
      response.json(getClustersByLocation({ clusters, cities, filters }))
    },

    async clusterDashboard(request, response) {
      const clusterId = request.params.clusterId
      const [clusterDoc, workerSnapshot, bookingSnapshot, catalogSnapshot] = await Promise.all([
        db.collection('clusters').doc(clusterId).get(),
        db.collection('workers').where('cluster_id', '==', clusterId).get(),
        db.collection('bookings').where('cluster_id', '==', clusterId).get(),
        db.collection('services').get(),
      ])

      if (!clusterDoc.exists) {
        sendError(response, 404, 'Cluster not found')
        return
      }

      const cluster = docToJson(clusterDoc)
      const workers = workerSnapshot.docs.map(docToJson)
      const bookings = bookingSnapshot.docs.map(docToJson)
      const services = catalogSnapshot.docs.map((doc) => doc.data().name).filter(Boolean)

      response.json(clusterCoverageSummary({ cluster, workers, bookings, services }))
    },

    async workerCoverage(request, response) {
      const [workerSnapshot, areaSnapshot] = await Promise.all([
        db.collection('workers').get(),
        db.collection('areas').get(),
      ])

      const workers = workerSnapshot.docs.map(docToJson)
      const areas = areaSnapshot.docs.map(docToJson)
      response.json(mapWorkerCoverage(workers, areas))
    },

    async listAreaNames(request, response) {
      const snapshot = await db.collection('areaNames').get()
      response.json(snapshot.docs
        .map(docToJson)
        .sort((left, right) => String(left.name || left.areaName || '').localeCompare(String(right.name || right.areaName || ''))))
    },

    async heatmap(request, response) {
      const [workerSnapshot, areaSnapshot, bookingSnapshot] = await Promise.all([
        db.collection('workers').get(),
        db.collection('areas').get(),
        db.collection('bookings').get(),
      ])

      response.json(buildHeatmapZones({
        areas: areaSnapshot.docs.map(docToJson),
        workers: workerSnapshot.docs.map(docToJson),
        bookings: bookingSnapshot.docs.map(docToJson),
      }))
    },

    async expansionDashboard(request, response) {
      const [
        hierarchy,
        clusterSnapshot,
        workerSnapshot,
        bookingSnapshot,
        complaintSnapshot,
        toLetSnapshot,
        assistanceSnapshot,
        coordinatorSnapshot,
        catalogSnapshot,
      ] = await Promise.all([
        getHierarchy(),
        db.collection('clusters').get(),
        db.collection('workers').get(),
        db.collection('bookings').get(),
        db.collection('complaints').get(),
        db.collection('toletListings').get(),
        db.collection('assistanceRequests').get(),
        db.collection('coordinators').get(),
        db.collection('services').get(),
      ])

      response.json({
        ...hierarchy,
        clusters: clusterSnapshot.docs.map(docToJson),
        workers: workerSnapshot.docs.map(docToJson),
        bookings: bookingSnapshot.docs.map(docToJson),
        complaints: complaintSnapshot.docs.map(docToJson),
        toLetListings: toLetSnapshot.docs.map(docToJson),
        assistanceRequests: assistanceSnapshot.docs.map(docToJson),
        coordinators: coordinatorSnapshot.docs.map(docToJson),
        services: catalogSnapshot.docs.map((doc) => doc.data().name || doc.data().label).filter(Boolean),
      })
    },

    async createArea(request, response) {
      const payload = normalizeAreaNamePayload(request.body, { create: true })

      if (!payload.name) {
        sendError(response, 400, 'Area name is required')
        return
      }

      const existing = await db.collection('areaNames').where('name', '==', payload.name).get()
      if (!existing.empty) {
        sendError(response, 409, 'Duplicate area name detected')
        return
      }

      const ref = await db.collection('areaNames').add(payload)
      response.status(201).json({ id: ref.id, ...payload })
    },

    async updateArea(request, response) {
      const ref = db.collection('areaNames').doc(request.params.areaId)
      const doc = await ref.get()
      if (!doc.exists) {
        sendError(response, 404, 'Area not found')
        return
      }

      const updates = normalizeAreaNamePayload(request.body || {})
      await ref.set(updates, { merge: true })
      response.json({ id: doc.id, ...doc.data(), ...updates })
    },

    async deleteArea(request, response) {
      const ref = db.collection('areaNames').doc(request.params.areaId)
      const doc = await ref.get()
      if (!doc.exists) {
        sendError(response, 404, 'Area not found')
        return
      }

      await ref.delete()
      response.status(204).send()
    },

    async createCity(request, response) {
      if (!request.body?.name || !request.body?.district_id) {
        sendError(response, 400, 'name and district_id are required')
        return
      }

      const payload = withTimestamps({
        ...request.body,
        type: request.body.type || 'city',
        active: request.body.active ?? true,
      }, { create: true })
      const ref = await db.collection('cities').add(payload)
      response.status(201).json({ id: ref.id, ...payload })
    },

    async updateCity(request, response) {
      const ref = db.collection('cities').doc(request.params.cityId)
      const doc = await ref.get()
      if (!doc.exists) {
        sendError(response, 404, 'City not found')
        return
      }

      const updates = withTimestamps(request.body || {})
      await ref.set(updates, { merge: true })
      response.json({ id: doc.id, ...doc.data(), ...updates })
    },
  }
}
