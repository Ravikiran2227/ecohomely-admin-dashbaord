import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { Card } from '../components/Card'
import Btn from '../components/Btn'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import ListToolbar from '../components/ListToolbar'
import Modal from '../components/Modal'
import SectionCard from '../components/SectionCard'
import { DataTable, TableRow, TD } from '../components/Table'
import { useAuth } from '../context/authContextValue'
import { PERMISSIONS, RBAC_AREAS, RBAC_CITIES, ROLES } from '../config/rbac'
import { C } from '../theme'

const COLS = [
  { label: 'Name' },
  { label: 'Email' },
  { label: 'Role' },
  { label: 'Assigned City / Area' },
  { label: 'Status' },
  { label: 'Last Active' },
  { label: 'Actions' },
]

const DEFAULT_FORM = {
  name: '',
  email: '',
  role: ROLES.SUB_ADMIN,
  city: 'Visakhapatnam',
  area: 'All Areas',
}

const PERMISSION_MATRIX = [
  { role: ROLES.SUPER_ADMIN, note: 'Full platform access, settings, payments, and staff control.' },
  { role: ROLES.ADMIN, note: 'Operational control across workers, bookings, complaints, and finance.' },
  { role: ROLES.SUB_ADMIN, note: 'Restricted to booking and complaint workflows for assigned city/area.' },
]

function AdminForm({ value, onChange }) {
  const setField = (key, nextValue) => onChange({ ...value, [key]: nextValue })

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input value={value.name} onChange={(event) => setField('name', event.target.value)} placeholder="Full name" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-[14px] text-[var(--text-main)]" />
        <input value={value.email} onChange={(event) => setField('email', event.target.value)} placeholder="Email address" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-[14px] text-[var(--text-main)]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <select value={value.role} onChange={(event) => setField('role', event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-[14px] text-[var(--text-main)]">
          {Object.values(ROLES).map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <select value={value.city} onChange={(event) => setField('city', event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-[14px] text-[var(--text-main)]">
          {RBAC_CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
        <select value={value.area} onChange={(event) => setField('area', event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-[14px] text-[var(--text-main)]">
          {RBAC_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
        </select>
      </div>
    </div>
  )
}

export default function AdminManagement() {
  const { users, createUser, updateUser, deleteUser, activityLogs, error, hasPermission, loading, unauthorized, usersLoading } = useAuth()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ role: '', city: '' })
  const [modal, setModal] = useState({ type: null, user: null })
  const [form, setForm] = useState(DEFAULT_FORM)
  const [credentials, setCredentials] = useState(null)
  const [operationError, setOperationError] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredUsers = useMemo(() => users.filter((user) => {
    if (filters.role && user.role !== filters.role) return false
    if (filters.city && user.city !== filters.city) return false
    if (query && !`${user.name} ${user.username} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [filters, query, users])

  const securitySummary = [
    { label: 'Admins', value: 1, color: '#0F5C37' },
    { label: 'Managers', value: 2, color: '#2563EB' },
    { label: 'Sub Managers', value: 2, color: '#F59E0B' },
    { label: 'Invites Pending', value: users.filter((user) => user.status === 'Invited').length, color: '#DC2626' },
  ]

  const recentAdminLogs = activityLogs.filter((item) => item.module === 'Admin Access' || String(item.user_type || '').includes('Admin')).slice(0, 6)

  const openCreate = () => {
    setForm(DEFAULT_FORM)
    setCredentials(null)
    setOperationError('')
    setModal({ type: 'create', user: null })
  }

  const openEdit = (user) => {
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      city: user.city,
      area: user.area,
    })
    setCredentials(null)
    setOperationError('')
    setModal({ type: 'edit', user })
  }

  const closeModal = () => {
    setModal({ type: null, user: null })
    setCredentials(null)
    setOperationError('')
  }

  const handleSubmit = async () => {
    if (!form.name || !form.email) return
    setSaving(true)
    setOperationError('')

    try {
      if (modal.type === 'create') {
        const result = await createUser(form)
        setCredentials({ email: result.newUser.email, password: result.generatedPassword })
        setModal({ type: 'credentials', user: result.newUser })
        return
      }

      if (modal.type === 'edit' && modal.user) {
        await updateUser(modal.user.id, form)
        closeModal()
      }
    } catch (nextError) {
      setOperationError(nextError.message || 'Unable to save admin user.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (userId) => {
    setOperationError('')
    try {
      await deleteUser(userId)
    } catch (nextError) {
      setOperationError(nextError.message || 'Unable to delete admin user.')
    }
  }

  if (loading || usersLoading) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Admin / Sub-Admin Access" sub="Loading admin users, roles, and permissions from the backend" />
        <Card style={{ background: '#FFFFFF', borderRadius: 16 }} pad={24}>
          <div className="text-sm font-semibold text-[var(--text-muted)]">Loading admin access data...</div>
        </Card>
      </div>
    )
  }

  if (unauthorized) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Admin / Sub-Admin Access" sub="Access restricted" />
        <EmptyState title="Unauthorized" description={error || 'Your current admin account does not have access to manage admin users.'} />
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Admin / Sub-Admin Access"
        sub="Manage platform staff, role permissions, assigned areas, and credential handoffs from one place"
        action={<Btn v="primary" onClick={openCreate} disabled={!hasPermission(PERMISSIONS.manageAdmins)}>Create User</Btn>}
      />

      {operationError ? (
        <Card style={{ borderRadius: 16, borderColor: '#DC2626', color: '#DC2626' }} pad={14}>
          <div className="text-sm font-bold">{operationError}</div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {securitySummary.map((item) => (
            <SectionCard key={item.label} title={item.label} className="!p-4 h-full">
              <div className="text-[28px] font-extrabold leading-none" style={{ color: item.color }}>{item.value}</div>
            </SectionCard>
          ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4">
        <Card style={{ background: '#FFFFFF', borderRadius: 16 }} pad={16}>
          <ListToolbar
            title="Admin management table"
            subtitle="Create, edit, reassign, and retire staff accounts with role-aware access."
            resultLabel={`${filteredUsers.length} of ${users.length} staff accounts shown`}
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Search by name, username, email, or role"
            actions={(
              <div className="flex flex-wrap gap-2">
                <Btn v="outline" size="sm" onClick={() => setModal({ type: 'permissions', user: null })}>Permission Matrix</Btn>
                <Btn v="outline" size="sm" onClick={() => setModal({ type: 'activity', user: null })}>Recent Access Activity</Btn>
                <Badge label={hasPermission(PERMISSIONS.manageAdmins) ? 'Full access enabled' : 'Restricted'} color={hasPermission(PERMISSIONS.manageAdmins) ? '#16A34A' : '#F59E0B'} />
              </div>
            )}
            filters={(
              <>
                <select value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))} className="h-11 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 text-sm font-semibold text-[var(--text-main)]">
                  <option value="">All roles</option>
                  {Object.values(ROLES).map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <select value={filters.city} onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))} className="h-11 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 text-sm font-semibold text-[var(--text-main)]">
                  <option value="">All cities</option>
                  {RBAC_CITIES.filter((city) => city !== 'All Cities').map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
                <Btn v="ghost" size="sm" onClick={() => { setQuery(''); setFilters({ role: '', city: '' }) }}>Reset</Btn>
              </>
            )}
            className="mb-4"
          />

          {filteredUsers.length > 0 ? (
            <DataTable cols={COLS}>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TD>
                    <div className="grid gap-1">
                      <span className="font-bold text-[var(--text-main)]">{user.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">{user.username || 'No username'}</span>
                    </div>
                  </TD>
                  <TD>{user.email}</TD>
                  <TD><Badge label={user.role} color={user.role === ROLES.SUPER_ADMIN ? '#0F5C37' : user.role === ROLES.ADMIN ? '#2563EB' : '#F59E0B'} /></TD>
                  <TD>{user.city} / {user.area}</TD>
                  <TD><Badge label={user.status} color={user.status === 'Active' ? '#16A34A' : '#F59E0B'} /></TD>
                  <TD>{user.lastActiveAt}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-2">
                      <Btn size="xs" v="outline" onClick={() => openEdit(user)} disabled={!hasPermission(PERMISSIONS.manageAdmins)}>Edit</Btn>
                      <Btn size="xs" v="danger" onClick={() => handleDelete(user.id)} disabled={!hasPermission(PERMISSIONS.manageAdmins) || user.role === ROLES.SUPER_ADMIN}>Delete</Btn>
                    </div>
                  </TD>
                </TableRow>
              ))}
            </DataTable>
          ) : (
            <EmptyState
              title="No admin accounts found"
              description="Try resetting the role or city filters to restore the staff list."
              action={<Btn v="outline" onClick={() => { setQuery(''); setFilters({ role: '', city: '' }) }}>Clear filters</Btn>}
            />
          )}
        </Card>
      </div>

      <Modal
        isOpen={modal.type === 'create' || modal.type === 'edit'}
        title={modal.type === 'create' ? 'Create Admin User' : 'Edit Admin User'}
        onClose={closeModal}
        size="lg"
        footer={(
          <>
            <Btn v="outline" onClick={closeModal}>Cancel</Btn>
            <Btn v="primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : modal.type === 'create' ? 'Create User' : 'Save Changes'}</Btn>
          </>
        )}
      >
        {operationError ? <div className="mb-4 text-sm font-bold text-red-600">{operationError}</div> : null}
        <AdminForm value={form} onChange={setForm} />
      </Modal>

      <Modal
        isOpen={modal.type === 'permissions'}
        title="Permission Matrix"
        onClose={closeModal}
        size="md"
        footer={<Btn v="primary" onClick={closeModal}>Done</Btn>}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {PERMISSION_MATRIX.map((item) => (
            <div key={item.role} style={{ padding: 12, borderRadius: 14, background: C.bg, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{item.role}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>{item.note}</div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={modal.type === 'activity'}
        title="Recent Access Activity"
        onClose={closeModal}
        size="md"
        footer={<Btn v="primary" onClick={closeModal}>Done</Btn>}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {recentAdminLogs.length > 0 ? recentAdminLogs.map((item) => (
            <div key={item.id} style={{ borderRadius: 14, border: `1px solid ${C.border}`, background: C.bg, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{item.action}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>{item.description}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>{item.timestamp}</div>
            </div>
          )) : (
            <div style={{ fontSize: 13, color: C.muted, padding: 12 }}>No recent access activity recorded.</div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={modal.type === 'credentials'}
        title="Credentials Generated"
        onClose={closeModal}
        size="md"
        footer={<Btn v="primary" onClick={closeModal}>Done</Btn>}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ padding: 14, borderRadius: 14, background: `${C.success}22`, color: C.success, fontSize: 13, fontWeight: 700 }}>
            Password auto-generated and email dispatch queued successfully.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Email</div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 700 }}>{credentials?.email}</div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Temporary Password</div>
            <div style={{ fontSize: 16, color: C.text, fontWeight: 900, padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg }}>
              {credentials?.password}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
