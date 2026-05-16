export function sendError(response, status, message, details = undefined) {
  response.status(status).json({
    message,
    error: {
      message,
      status,
      details,
    },
  })
}

export function asyncRoute(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response, next)
    } catch (error) {
      next(error)
    }
  }
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error)
    return
  }

  const status = Number(error.status || error.statusCode || 500)
  const message = status >= 500 ? 'Internal server error' : error.message || 'Request failed'
  sendError(response, status, message)
}

export function notFound(request, response) {
  sendError(response, 404, `Route not found: ${request.method} ${request.originalUrl || request.url}`)
}

export function requireBodyObject(request, response, next) {
  const body = request.body

  if (!body || Array.isArray(body) || typeof body !== 'object') {
    sendError(response, 400, 'Request body must be a JSON object')
    return
  }

  next()
}

export function requireFields(fields = []) {
  return (request, response, next) => {
    const missing = fields.filter((field) => request.body?.[field] === undefined || request.body?.[field] === '')

    if (missing.length > 0) {
      sendError(response, 400, `Missing required fields: ${missing.join(', ')}`, { missing })
      return
    }

    next()
  }
}

export function requireParam(name) {
  return (request, response, next) => {
    if (!request.params?.[name]) {
      sendError(response, 400, `${name} is required`)
      return
    }

    next()
  }
}
