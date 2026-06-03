export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  SUB_ADMIN: 'Sub Admin / Employee',
}

export const PERMISSIONS = {
  manageAdmins: 'manage_admins',
  manageWorkers: 'manage_workers',
  manageBookings: 'manage_bookings',
  manageComplaints: 'manage_complaints',
  managePayments: 'manage_payments',
  viewSettings: 'view_settings',
  viewDashboard: 'view_dashboard',
  viewActivityLogs: 'view_activity_logs',
}

export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.SUB_ADMIN]: [
    PERMISSIONS.viewDashboard,
    PERMISSIONS.manageBookings,
    PERMISSIONS.manageComplaints,
    PERMISSIONS.viewActivityLogs,
  ],
}

export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || []
}

export function hasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission)
}

export function generateTemporaryPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function buildAdminUserPayload(payload = {}) {
  return {
    username: payload.username || payload.userName || payload.email || '',
    name: payload.name || '',
    email: payload.email || '',
    role: payload.role || ROLES.SUB_ADMIN,
    city: payload.city || 'Visakhapatnam',
    area: payload.area || 'All Areas',
    status: payload.status || 'Invited',
    permissions: getPermissionsForRole(payload.role || ROLES.SUB_ADMIN),
    assignedModules: getPermissionsForRole(payload.role || ROLES.SUB_ADMIN),
    createdAt: payload.createdAt || new Date().toISOString(),
    lastActiveAt: payload.lastActiveAt || null,
  }
}

function roleLabel(role = '') {
  const value = String(role || '').toLowerCase()
  if (value.includes('manager') && !value.includes('sub')) return 'Manager'
  if (value.includes('sub')) return 'Sub Manager'
  return role || 'Admin'
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function buildCredentialsEmail(payload = {}) {
  const role = roleLabel(payload.role)
  const subject = 'Ecohomely Admin Dashboard Login Credentials'
  const text = [
    `Hello ${payload.name || 'Admin'},`,
    '',
    'Your Ecohomely admin dashboard account has been created.',
    '',
    `Name: ${payload.name || ''}`,
    `Email: ${payload.email || ''}`,
    `Username: ${payload.username || payload.email || ''}`,
    `Password: ${payload.password || ''}`,
    `Role: ${role}`,
    '',
    'Please sign in and change your password after your first login.',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#102033">
      <h2>Ecohomely Admin Dashboard Credentials</h2>
      <p>Hello <strong>${escapeHtml(payload.name || 'Admin')}</strong>,</p>
      <p>Your Ecohomely admin dashboard account has been created.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7e2ee">
        <tr><td><strong>Name</strong></td><td>${escapeHtml(payload.name || '')}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(payload.email || '')}</td></tr>
        <tr><td><strong>Username</strong></td><td>${escapeHtml(payload.username || payload.email || '')}</td></tr>
        <tr><td><strong>Password</strong></td><td>${escapeHtml(payload.password || '')}</td></tr>
        <tr><td><strong>Role</strong></td><td>${escapeHtml(role)}</td></tr>
      </table>
      <p>Please sign in and change your password after your first login.</p>
    </div>
  `

  return { subject, text, html, role }
}

async function sendWithResend(payload, emailMessage) {
  const apiKey = process.env.RESEND_API_KEY || ''
  if (!apiKey) return null

  const from = process.env.ADMIN_CREDENTIAL_FROM_EMAIL || process.env.MAIL_FROM || 'Ecohomely Admin <noreply@ecohomely.com>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.email],
      subject: emailMessage.subject,
      text: emailMessage.text,
      html: emailMessage.html,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Email provider failed with ${response.status}`)
  }

  return { ok: true, status: 'sent', provider: 'resend', id: data?.id || '', to: payload.email }
}

export async function sendCredentialsEmail({ db, email, name, username, password, role, adminUserId }) {
  if (!email || !password) {
    throw new Error('Email and password are required to send admin credentials.')
  }

  const payload = { email, name, username, password, role, adminUserId }
  const emailMessage = buildCredentialsEmail(payload)
  const sent = await sendWithResend(payload, emailMessage)
  if (sent) return sent

  if (db) {
    const mailRef = await db.collection('mail').add({
      to: [email],
      message: {
        subject: emailMessage.subject,
        text: emailMessage.text,
        html: emailMessage.html,
      },
      category: 'admin_credentials',
      adminUserId: adminUserId || '',
      createdAt: new Date(),
      delivery: { status: 'queued' },
    })

    await db.collection('adminCredentialEmails').add({
      adminUserId: adminUserId || '',
      name: name || '',
      email,
      username: username || email,
      role: emailMessage.role,
      mailId: mailRef.id,
      status: 'queued',
      createdAt: new Date(),
    }).catch(() => null)

    return { ok: true, status: 'queued', provider: 'firebase-mail', id: mailRef.id, to: email }
  }

  return { ok: false, status: 'failed', provider: 'none', to: email, message: 'No mail provider configured.' }
}
