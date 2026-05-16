const MSG91_BASE_URL = 'https://api.msg91.com/api/v5'

function env(name, fallback = '') {
  return globalThis.process?.env?.[name] || fallback
}

function normalizeMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `91${digits}`
  return digits
}

function parseProviderResponse(data) {
  if (!data || typeof data !== 'object') return {}
  return {
    requestId: data.request_id || data.requestId || data.requestIdString || data.id || '',
    status: data.type || data.status || '',
    provider: data,
  }
}

export function createMsg91Service() {
  const authkey = env('MSG91_AUTHKEY')
  const sender = env('MSG91_SENDER_ID', 'TRKHDQ')
  const templateId = env('MSG91_TEMPLATE_ID')

  function ensureConfigured() {
    if (!authkey) {
      const error = new Error('MSG91_AUTHKEY is not configured on the backend.')
      error.status = 503
      throw error
    }
  }

  async function request(path, { method = 'GET', body, query } = {}) {
    ensureConfigured()

    const url = new URL(`${MSG91_BASE_URL}${path}`)
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        authkey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { message: text }
      }
    }

    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `MSG91 error ${response.status}`)
      error.status = response.status
      error.details = data
      throw error
    }

    return data
  }

  async function sendSMS({ mobile, message, senderId }) {
    const normalizedMobile = normalizeMobile(mobile)

    if (!normalizedMobile) {
      const error = new Error('A valid mobile number is required.')
      error.status = 400
      throw error
    }

    if (!message) {
      const error = new Error('message is required.')
      error.status = 400
      throw error
    }

    const data = await request('/flow/', {
      method: 'POST',
      body: {
        sender: senderId || sender,
        short_url: '0',
        mobiles: normalizedMobile,
        message,
        ...(templateId ? { template_id: templateId } : {}),
      },
    })

    return {
      mobile: normalizedMobile,
      ...parseProviderResponse(data),
    }
  }

  async function sendBulkSMS(recipients = []) {
    if (!Array.isArray(recipients) || recipients.length === 0) {
      const error = new Error('recipients must be a non-empty array.')
      error.status = 400
      throw error
    }

    const results = await Promise.allSettled(recipients.map((recipient) => sendSMS(recipient)))
    return {
      total: results.length,
      sent: results.filter((result) => result.status === 'fulfilled').length,
      failed: results.filter((result) => result.status === 'rejected').length,
      results: results.map((result, index) => result.status === 'fulfilled'
        ? { ok: true, ...result.value }
        : { ok: false, mobile: normalizeMobile(recipients[index]?.mobile), error: result.reason?.message || 'SMS failed' }),
    }
  }

  async function getDeliveryReport(requestId) {
    if (!requestId) {
      const error = new Error('requestId is required.')
      error.status = 400
      throw error
    }

    return request('/report/', {
      query: { requestId },
    })
  }

  return {
    getDeliveryReport,
    sendBulkSMS,
    sendSMS,
  }
}
