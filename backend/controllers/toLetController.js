import { sendError } from '../http.js'
import { createToLetService } from '../services/toLetService.js'

function notFound(response, label) {
  sendError(response, 404, `${label} not found`)
}

export function createToLetController(db) {
  const service = createToLetService(db)

  return {
    async dashboard(request, response) {
      response.json(await service.dashboard())
    },

    async listListings(request, response) {
      response.json(await service.listListings(request.query || {}))
    },

    async getListing(request, response) {
      const listing = await service.getListing(request.params.listingId)
      if (!listing) {
        notFound(response, 'ToLet listing')
        return
      }
      response.json(listing)
    },

    async createListing(request, response) {
      response.status(201).json(await service.createListing(request.body || {}))
    },

    async updateListing(request, response) {
      const listing = await service.updateListing(request.params.listingId, request.body || {})
      if (!listing) {
        notFound(response, 'ToLet listing')
        return
      }
      response.json(listing)
    },

    async deleteListing(request, response) {
      const listing = await service.deleteListing(request.params.listingId)
      if (!listing) {
        notFound(response, 'ToLet listing')
        return
      }
      response.status(204).end()
    },

    async reviewListing(request, response) {
      const listing = await service.reviewListing(request.params.listingId, request.body || {})
      if (!listing) {
        notFound(response, 'ToLet listing')
        return
      }
      response.json(listing)
    },

    async extendListingTrial(request, response) {
      const listing = await service.extendListingTrial(request.params.listingId, request.body || {})
      if (!listing) {
        notFound(response, 'ToLet listing')
        return
      }
      response.json(listing)
    },

    async listEnquiries(request, response) {
      response.json(await service.listEnquiries(request.query || {}))
    },

    async getEnquiry(request, response) {
      const enquiry = await service.getEnquiry(request.params.enquiryId)
      if (!enquiry) {
        notFound(response, 'ToLet enquiry')
        return
      }
      response.json(enquiry)
    },

    async createEnquiry(request, response) {
      response.status(201).json(await service.createEnquiry(request.body || {}))
    },

    async updateEnquiry(request, response) {
      const enquiry = await service.updateEnquiry(request.params.enquiryId, request.body || {})
      if (!enquiry) {
        notFound(response, 'ToLet enquiry')
        return
      }
      response.json(enquiry)
    },

    async deleteEnquiry(request, response) {
      const enquiry = await service.deleteEnquiry(request.params.enquiryId)
      if (!enquiry) {
        notFound(response, 'ToLet enquiry')
        return
      }
      response.status(204).end()
    },

    async listCategories(request, response) {
      response.json(await service.listCategories())
    },

    async getCategory(request, response) {
      const category = await service.getCategory(request.params.categoryId)
      if (!category) {
        notFound(response, 'ToLet category')
        return
      }
      response.json(category)
    },

    async createCategory(request, response) {
      response.status(201).json(await service.createCategory(request.body || {}))
    },

    async updateCategory(request, response) {
      const category = await service.updateCategory(request.params.categoryId, request.body || {})
      if (!category) {
        notFound(response, 'ToLet category')
        return
      }
      response.json(category)
    },

    async deleteCategory(request, response) {
      const category = await service.deleteCategory(request.params.categoryId)
      if (!category) {
        notFound(response, 'ToLet category')
        return
      }
      response.status(204).end()
    },
  }
}
