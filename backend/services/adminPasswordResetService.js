const ADMIN_COLLECTIONS = ['admins', 'managers', 'sub_managers', 'adminUsers']
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
const ACCOUNT_NOT_FOUND_MESSAGE = 'Account is not existed.'
const RESET_EMAIL_SENT_MESSAGE = 'Password reset link has been sent to your email.'

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildPasswordResetEmail({ name, role, resetUrl }) {
  const subject = 'Reset your Ecohomely Admin password'
  const text = [
    `Hello ${name || 'Admin'},`,
    '',
    'We received a request to reset your Ecohomely admin dashboard password.',
    `Role: ${role || 'Admin'}`,
    '',
    'Open this link to choose a new password (valid for 1 hour):',
    resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#102033;max-width:560px">
      <h2 style="color:#0f5c37">Reset your admin password</h2>
      <p>Hello <strong>${escapeHtml(name || 'Admin')}</strong>,</p>
      <p>We received a request to reset your Ecohomely admin dashboard password.</p>
      <p><strong>Role:</strong> ${escapeHtml(role || 'Admin')}</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;background:#0f5c37;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">
          Reset Password
        </a>
      </p>
      <p style="font-size:13px;color:#64748b">This link expires in 1 hour.</p>
    </div>
  `
  return { subject, text, html }
}

function getEmailJsConfig() {
  return {
    serviceId: process.env.EMAILJS_SERVICE_ID || process.env.VITE_EMAILJS_SERVICE_ID || '',
    templateId: process.env.EMAILJS_PASSWORD_RESET_TEMPLATE_ID || process.env.VITE_EMAILJS_PASSWORD_RESET_TEMPLATE_ID || '',
    publicKey: process.env.EMAILJS_PUBLIC_KEY || process.env.VITE_EMAILJS_PUBLIC_KEY || '',
  }
}

async function sendPasswordResetEmail(payload = {}) {
  const config = getEmailJsConfig()
  if (!config.serviceId || !config.templateId || !config.publicKey) {
    throw new Error('EmailJS password reset template is not configured.')
  }

  const email = buildPasswordResetEmail(payload)
  const name = payload.name || payload.username || 'Admin'
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      template_params: {
        email: payload.email,
        to_email: payload.email,
        to_name: name,
        name,
        username: payload.username || payload.email,
        role: payload.role || 'Admin',
        reset_url: payload.resetUrl,
        reset_link: payload.resetUrl,
        subject: email.subject,
        message: email.text,
        html_message: email.html,
        expires_in: '1 hour',
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `EmailJS failed with status ${response.status}`)
  }

  return { status: 'sent', provider: 'emailjs', to: payload.email }
}

function identifierMatches(data = {}, identifier = '') {
  const login = String(identifier || '').trim().toLowerCase()
  if (!login) return false
  return [
    data.id,
    data.username,
    data.userName,
    data.email,
  ].map((value) => String(value || '').trim().toLowerCase()).includes(login)
}

async function findAdminByIdentifier(db, identifier) {
  const normalized = String(identifier || '').trim()
  if (!normalized) return null

  for (const collectionName of ADMIN_COLLECTIONS) {
    const snapshot = await db.collection(collectionName).get().catch(() => ({ docs: [] }))
    const match = snapshot.docs.find((doc) => identifierMatches({ id: doc.id, ...doc.data() }, normalized))
    if (match) {
      return {
        id: match.id,
        collectionName,
        ...match.data(),
      }
    }
  }

  return null
}

function createToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

export function createAdminPasswordResetHandlers(db) {
  return {
    async requestReset(request, response) {
      const identifier = request.body?.identifier || request.body?.email || request.body?.username || ''
      const admin = await findAdminByIdentifier(db, identifier)
      const appOrigin = process.env.ADMIN_APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173'

      if (!admin || !admin.email) {
        response.status(404).json({ success: false, found: false, message: ACCOUNT_NOT_FOUND_MESSAGE })
        return
      }

      if (admin.locked === true || admin.locked === 'true' || admin.status === 'Blocked') {
        response.status(403).json({ success: false, message: 'Account is locked. Contact your administrator.' })
        return
      }

      const token = createToken()
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString()
      const resetUrl = `${appOrigin.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`
      await db.collection('adminPasswordResets').doc(token).set({
        adminId: admin.id,
        collectionName: admin.collectionName,
        email: admin.email,
        username: admin.username || admin.userName || admin.email,
        role: admin.role || '',
        expiresAt,
        used: false,
        createdAt: new Date().toISOString(),
      })

      const delivery = await sendPasswordResetEmail({
        email: admin.email,
        name: admin.name || admin.username,
        username: admin.username || admin.userName || admin.email,
        role: admin.role,
        resetUrl,
      })

      await db.collection('adminPasswordResetEmails').add({
        adminUserId: admin.id,
        email: admin.email,
        username: admin.username || admin.userName || admin.email,
        role: admin.role || '',
        status: delivery.status,
        provider: delivery.provider,
        createdAt: new Date(),
      }).catch(() => null)

      response.json({ success: true, found: true, message: RESET_EMAIL_SENT_MESSAGE, emailDelivery: delivery })
    },

    async validateToken(request, response) {
      const token = request.params.token
      const snapshot = await db.collection('adminPasswordResets').doc(token).get()

      if (!snapshot.exists) {
        response.status(404).json({ error: 'This reset link is invalid or has expired.' })
        return
      }

      const record = snapshot.data()
      if (record.used) {
        response.status(400).json({ error: 'This reset link has already been used.' })
        return
      }

      if (!record.expiresAt || new Date(record.expiresAt).getTime() < Date.now()) {
        response.status(400).json({ error: 'This reset link has expired.' })
        return
      }

      response.json({
        valid: true,
        email: record.email,
        username: record.username,
        role: record.role,
        expiresAt: record.expiresAt,
      })
    },

    async completeReset(request, response) {
      const token = request.body?.token
      const password = String(request.body?.password || '')

      if (!password || password.length < 6) {
        response.status(400).json({ error: 'Password must be at least 6 characters.' })
        return
      }

      const ref = db.collection('adminPasswordResets').doc(token)
      const snapshot = await ref.get()

      if (!snapshot.exists) {
        response.status(404).json({ error: 'This reset link is invalid or has expired.' })
        return
      }

      const record = snapshot.data()
      if (record.used) {
        response.status(400).json({ error: 'This reset link has already been used.' })
        return
      }

      if (!record.expiresAt || new Date(record.expiresAt).getTime() < Date.now()) {
        response.status(400).json({ error: 'This reset link has expired.' })
        return
      }

      const now = new Date().toISOString()
      await db.collection(record.collectionName).doc(record.adminId).set({
        password,
        updatedAt: now,
      }, { merge: true })

      await ref.set({ used: true, usedAt: now }, { merge: true })
      response.json({ success: true, message: 'Password updated successfully. You can sign in now.' })
    },
  }
}
