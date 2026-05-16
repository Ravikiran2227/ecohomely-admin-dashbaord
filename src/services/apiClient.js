import { firebaseRequest } from './firebaseClient'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const DEFAULT_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT || 30000)
const USE_FIREBASE_FALLBACK = import.meta.env.VITE_FIREBASE_FALLBACK !== 'false'

let authTokenProvider = null

export class ApiError extends Error {
  constructor(message, { status = 0, statusText = '', data = null, url = '' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.data = data
    this.url = url
  }
}

export function setAuthToken(tokenOrProvider) {
  authTokenProvider = tokenOrProvider
}

export function clearAuthToken() {
  authTokenProvider = null
}

function getStoredToken() {
  if (typeof window === 'undefined') return null

  return (
    window.sessionStorage.getItem('authToken') ||
    window.sessionStorage.getItem('token')
  )
}

async function resolveAuthToken(token) {
  if (token) return token

  if (typeof authTokenProvider === 'function') {
    return authTokenProvider()
  }

  return authTokenProvider || getStoredToken()
}

function buildUrl(path, query) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${API_URL}${normalizedPath}`, window.location.origin)

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return

    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item))
      return
    }

    url.searchParams.set(key, value)
  })

  return url.toString()
}

async function parseResponse(response) {
  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (!text) return null

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch {
      throw new ApiError('The server returned invalid JSON.', {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      })
    }
  }

  return text
}

function getErrorMessage(data, fallback) {
  if (!data) return fallback
  if (typeof data === 'string') return data
  return data.message || data.error || fallback
}

export async function request(path, options = {}) {
  const {
    body,
    headers,
    method = body === undefined ? 'GET' : 'POST',
    query,
    signal,
    timeout = DEFAULT_TIMEOUT,
    token,
    ...fetchOptions
  } = options

  if (!API_URL) {
    return firebaseRequest(path, { body, method, query, token })
  }

  const controller = new AbortController()
  const timeoutId = timeout > 0 ? window.setTimeout(() => controller.abort(), timeout) : null
  const authToken = await resolveAuthToken(token)
  const requestHeaders = new Headers(headers || {})

  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json')
  }

  let requestBody = body
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(body)
  }

  if (authToken && !requestHeaders.has('Authorization')) {
    requestHeaders.set('Authorization', `Bearer ${authToken}`)
  }

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const url = buildUrl(path, query)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      body: requestBody,
      headers: requestHeaders,
      method,
      signal: controller.signal,
    })
    const data = await parseResponse(response)

    if (!response.ok) {
      throw new ApiError(getErrorMessage(data, response.statusText || 'Request failed.'), {
        status: response.status,
        statusText: response.statusText,
        data,
        url,
      })
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) throw error

    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out.', { url })
    }

    if (USE_FIREBASE_FALLBACK) {
      return firebaseRequest(path, { body, method, query, token })
    }

    throw new ApiError(error.message || 'Network request failed.', { url })
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId)
    }
  }
}

export const apiClient = {
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, body, method: 'POST' }),
  put: (path, body, options = {}) => request(path, { ...options, body, method: 'PUT' }),
  patch: (path, body, options = {}) => request(path, { ...options, body, method: 'PATCH' }),
  delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
}

export default apiClient
