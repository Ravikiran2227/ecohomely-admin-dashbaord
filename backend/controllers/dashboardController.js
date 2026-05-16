import { buildDashboardOverview } from '../services/dashboardService.js'

function docs(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

export function createDashboardController(db) {
  async function getDashboardData() {
    const [bookingSnapshot, complaintSnapshot, customerSnapshot, paymentSnapshot, workerSnapshot, toLetSnapshot, activitySnapshot] = await Promise.all([
      db.collection('bookings').get(),
      db.collection('complaints').get(),
      db.collection('customers').get(),
      db.collection('payments').get(),
      db.collection('workers').get(),
      db.collection('toletListings').get(),
      db.collection('activityLogs').get(),
    ])

    return {
      bookings: docs(bookingSnapshot),
      complaints: docs(complaintSnapshot),
      customers: docs(customerSnapshot),
      payments: docs(paymentSnapshot),
      workers: docs(workerSnapshot),
      toLetListings: docs(toLetSnapshot),
      activityLogs: docs(activitySnapshot),
    }
  }

  return {
    async overview(request, response) {
      response.json(buildDashboardOverview(await getDashboardData()))
    },

    async metrics(request, response) {
      response.json(buildDashboardOverview(await getDashboardData()))
    },

    async recentBookings(request, response) {
      const limit = Number(request.query?.limit || 10)
      const snapshot = await db.collection('bookings').get()
      response.json(docs(snapshot)
        .sort((left, right) => String(right.requestedAt || right.createdAt || '').localeCompare(String(left.requestedAt || left.createdAt || '')))
        .slice(0, Number.isNaN(limit) ? 10 : limit))
    },

    async revenue(request, response) {
      const snapshot = await db.collection('payments').get()
      const payments = docs(snapshot)
      const total = payments.reduce((sum, payment) => sum + Number(payment.amt || payment.amount || 0), 0)
      const verified = payments
        .filter((payment) => payment.status === 'Verified' || payment.status === 'Paid')
        .reduce((sum, payment) => sum + Number(payment.amt || payment.amount || 0), 0)

      response.json({ total, verified, payments })
    },

    async activity(request, response) {
      const limit = Number(request.query?.limit || 50)
      const snapshot = await db.collection('activityLogs').get()
      response.json(docs(snapshot)
        .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
        .slice(0, Number.isNaN(limit) ? 50 : limit))
    },

    async alerts(request, response) {
      const { complaints, workers, toLetListings } = await getDashboardData()
      response.json([
        ...complaints.filter((item) => item.status === 'Open' || item.status === 'In Progress'),
        ...workers.filter((item) => item.approvalStatus === 'Pending'),
        ...toLetListings.filter((item) => item.status === 'Pending'),
      ])
    },
  }
}
