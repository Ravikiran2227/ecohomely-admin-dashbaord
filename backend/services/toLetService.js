function docs(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

function withTimestamps(payload = {}, { create = false } = {}) {
  const now = new Date().toISOString()

  return {
    ...payload,
    ...(create && !payload.createdAt ? { createdAt: now } : {}),
    updatedAt: now,
  }
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function explicitId(payload, fallbackPrefix) {
  const id = String(payload?.id || payload?.listingId || payload?.enquiryId || '').trim()
  return id || `${fallbackPrefix}-${Date.now()}`
}

function normalizeCategoryId(payload) {
  return String(payload?.id || payload?.categoryId || slug(payload?.name) || `category-${Date.now()}`)
}

function applyFilters(items = [], filters = {}, fields = []) {
  return items.filter((item) => fields.every((field) => {
    const value = filters?.[field]
    if (value === undefined || value === null || value === '') return true
    return String(item[field] ?? '') === String(value)
  }))
}

export function createToLetService(db) {
  const listings = db.collection('toletListings')
  const enquiries = db.collection('toletEnquiries')
  const categories = db.collection('toletCategories')

  async function getListing(listingId) {
    const doc = await listings.doc(listingId).get()
    return doc.exists ? { id: doc.id, ...doc.data() } : null
  }

  async function getEnquiry(enquiryId) {
    const doc = await enquiries.doc(enquiryId).get()
    return doc.exists ? { id: doc.id, ...doc.data() } : null
  }

  async function getCategory(categoryId) {
    const doc = await categories.doc(categoryId).get()
    return doc.exists ? { id: doc.id, ...doc.data() } : null
  }

  return {
    async dashboard() {
      const [listingSnapshot, enquirySnapshot, categorySnapshot] = await Promise.all([
        listings.get(),
        enquiries.get(),
        categories.get(),
      ])

      const listingItems = docs(listingSnapshot)
      const enquiryItems = docs(enquirySnapshot)
      const categoryItems = docs(categorySnapshot)

      return {
        totalListings: listingItems.length,
        pendingListings: listingItems.filter((listing) => (listing.approvalStatus || listing.status) === 'Pending').length,
        activeListings: listingItems.filter((listing) => ['Approved', 'Active', 'Live'].includes(listing.approvalStatus || listing.status)).length,
        totalEnquiries: enquiryItems.length,
        openEnquiries: enquiryItems.filter((enquiry) => ['Open', 'New'].includes(enquiry.status)).length,
        categories: categoryItems,
        listings: listingItems,
        enquiries: enquiryItems,
      }
    },

    async listListings(filters) {
      const snapshot = await listings.get()
      return applyFilters(docs(snapshot), filters, ['status', 'approvalStatus', 'propertyType', 'categoryId', 'city_id', 'area_id'])
        .sort((left, right) => String(right.createdAt || right.postedAt || '').localeCompare(String(left.createdAt || left.postedAt || '')))
    },

    getListing,

    async createListing(payload) {
      const id = explicitId(payload, 'TL')
      const record = withTimestamps({ ...payload, id }, { create: true })
      await listings.doc(id).set(record, { merge: true })
      return record
    },

    async updateListing(listingId, payload) {
      const current = await getListing(listingId)
      if (!current) return null

      const updates = withTimestamps({ ...payload, id: listingId })
      await listings.doc(listingId).set(updates, { merge: true })
      return { ...current, ...updates }
    },

    async deleteListing(listingId) {
      const current = await getListing(listingId)
      if (!current) return null

      const enquirySnapshot = await enquiries.where('listingId', '==', listingId).get()
      await Promise.all([
        listings.doc(listingId).delete(),
        ...enquirySnapshot.docs.map((doc) => doc.ref.delete()),
      ])
      return current
    },

    async reviewListing(listingId, payload) {
      const current = await getListing(listingId)
      if (!current) return null

      const action = payload?.action
      const approvalStatus = action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : payload?.approvalStatus || payload?.status
      const now = new Date().toISOString()
      const updates = withTimestamps({
        approvalStatus,
        status: approvalStatus,
        reviewedAt: now,
        reviewNote: payload?.note || payload?.reason || '',
        ...(approvalStatus === 'Approved' ? { approvedAt: payload?.approvedAt || current.approvedAt || now.slice(0, 10), manualStatus: null } : {}),
        ...(approvalStatus === 'Rejected' ? { rejectReason: payload?.reason || '', rejectNote: payload?.note || '' } : {}),
      })

      await listings.doc(listingId).set(updates, { merge: true })
      return { ...current, ...updates }
    },

    async extendListingTrial(listingId, payload) {
      const current = await getListing(listingId)
      if (!current) return null

      const days = Number(payload?.days || 7)
      const updates = withTimestamps({
        trialExtensionDays: Number(current.trialExtensionDays || 0) + (Number.isFinite(days) ? days : 7),
      })
      await listings.doc(listingId).set(updates, { merge: true })
      return { ...current, ...updates }
    },

    async listEnquiries(filters) {
      const snapshot = await enquiries.get()
      return applyFilters(docs(snapshot), filters, ['status', 'listingId', 'customerId'])
        .sort((left, right) => String(right.createdAt || right.date || '').localeCompare(String(left.createdAt || left.date || '')))
    },

    getEnquiry,

    async createEnquiry(payload) {
      const id = explicitId(payload, 'EN')
      const record = withTimestamps({ ...payload, id }, { create: true })
      await enquiries.doc(id).set(record, { merge: true })
      return record
    },

    async updateEnquiry(enquiryId, payload) {
      const current = await getEnquiry(enquiryId)
      if (!current) return null

      const updates = withTimestamps({ ...payload, id: enquiryId })
      await enquiries.doc(enquiryId).set(updates, { merge: true })
      return { ...current, ...updates }
    },

    async deleteEnquiry(enquiryId) {
      const current = await getEnquiry(enquiryId)
      if (!current) return null

      await enquiries.doc(enquiryId).delete()
      return current
    },

    async listCategories() {
      const snapshot = await categories.get()
      return docs(snapshot).sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
    },

    getCategory,

    async createCategory(payload) {
      const id = normalizeCategoryId(payload)
      const record = withTimestamps({ ...payload, id, enabled: payload?.enabled !== false }, { create: true })
      await categories.doc(id).set(record, { merge: true })
      return record
    },

    async updateCategory(categoryId, payload) {
      const current = await getCategory(categoryId)
      if (!current) return null

      const updates = withTimestamps({ ...payload, id: categoryId })
      await categories.doc(categoryId).set(updates, { merge: true })
      return { ...current, ...updates }
    },

    async deleteCategory(categoryId) {
      const current = await getCategory(categoryId)
      if (!current) return null

      await categories.doc(categoryId).delete()
      return current
    },
  }
}
