import { useMemo, useState } from 'react'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import ListToolbar from '../components/ListToolbar'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import SectionCard from '../components/SectionCard'
import { DataTable, TableRow, TD } from '../components/Table'
import { PERMISSIONS, ROLES } from '../config/rbac'
import { useAuth } from '../context/authContextValue'

const COLS = ['Username', 'Name', 'Email', 'Role', 'Created Date', 'Last Login', 'Actions']

const DEFAULT_FORM = {
  username: '',
  password: '',
  name: '',
  email: '',
  role: 'sub_manager',
}

const ROLE_OPTIONS = [
  { value: 'sub_manager', label: 'Sub Manager' },
  { value: 'manager', label: 'Manager' },
]

function formatDate(value) {
  if (!value) return 'N/A'
  let date = value
  if (typeof value.toDate === 'function') date = value.toDate()
  else if (typeof value.toMillis === 'function') date = new Date(value.toMillis())
  else if (typeof value._seconds === 'number' || typeof value.seconds === 'number') date = new Date((value._seconds || value.seconds) * 1000)
  else date = new Date(String(value).replace(' ', 'T'))
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN') : String(value)
}

function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  return Array.from({ length: 12 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('')
}

function storedRole(role = '') {
  const value = String(role || '').toLowerCase()
  return value === 'manager' || role === ROLES.ADMIN ? 'manager' : 'sub_manager'
}

function displayRole(role = '') {
  return storedRole(role) === 'manager' ? 'Manager' : 'Sub Manager'
}

function isSubAdminUser(user = {}) {
  return user.role === ROLES.ADMIN || user.role === ROLES.SUB_ADMIN || ['manager', 'sub_manager'].includes(String(user.rawRole || user.role).toLowerCase())
}

function AdminForm({ value, onChange, editing }) {
  const setField = (key, nextValue) => onChange({ ...value, [key]: nextValue })

  return (
    <div className="grid gap-4">
      <label className="grid gap-2">
        <span className="text-sm font-bold text-[var(--text-main)]">Username</span>
        <input value={value.username} onChange={(event) => setField('username', event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)]" required />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-[var(--text-main)]">Password {editing ? '(leave blank to keep current)' : ''}</span>
        <div className="flex gap-2">
          <input type="password" value={value.password} onChange={(event) => setField('password', event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)]" required={!editing} />
          {!editing ? <Btn type="button" v="success" size="sm" onClick={() => setField('password', generatePassword())}>Generate</Btn> : null}
        </div>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-[var(--text-main)]">Name</span>
        <input value={value.name} onChange={(event) => setField('name', event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)]" required />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-[var(--text-main)]">Email</span>
        <input type="email" value={value.email} onChange={(event) => setField('email', event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)]" required />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-[var(--text-main)]">Role</span>
        <select value={value.role} onChange={(event) => setField('role', event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)]">
          {ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
        </select>
      </label>

      {value.password && !editing ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          Generated Password: {value.password}
        </div>
      ) : null}
    </div>
  )
}

function CredentialsPanel({ credentials }) {
  const message = `Ecohomely Admin Credentials\n\nUsername: ${credentials?.username || ''}\nPassword: ${credentials?.password || ''}\nRole: ${displayRole(credentials?.role)}\nName: ${credentials?.name || ''}`

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-400">Sub admin created successfully.</div>
      <div className="grid gap-2 text-sm text-[var(--text-main)]">
        <div><span className="font-bold">Username:</span> {credentials?.username}</div>
        <div><span className="font-bold">Password:</span> {credentials?.password}</div>
        <div><span className="font-bold">Role:</span> {displayRole(credentials?.role)}</div>
        <div><span className="font-bold">Name:</span> {credentials?.name}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn v="outline" onClick={() => navigator.clipboard.writeText(message)}>Copy Credentials</Btn>
        <Btn v="success" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')}>Share via WhatsApp</Btn>
      </div>
    </div>
  )
}

export default function AdminManagement() {
  const { users, createUser, updateUser, deleteUser, error, hasPermission, loading, unauthorized, usersLoading } = useAuth()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ role: '' })
  const [modal, setModal] = useState({ type: null, user: null })
  const [form, setForm] = useState(DEFAULT_FORM)
  const [credentials, setCredentials] = useState(null)
  const [operationError, setOperationError] = useState('')
  const [saving, setSaving] = useState(false)

  const subAdminUsers = useMemo(() => users.filter(isSubAdminUser), [users])
  const filteredUsers = useMemo(() => subAdminUsers.filter((user) => {
    if (filters.role && user.role !== filters.role) return false
    if (query && !`${user.username} ${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [filters.role, query, subAdminUsers])

  const securitySummary = [
    { label: 'Managers', value: subAdminUsers.filter((user) => user.role === ROLES.ADMIN).length, color: '#2563EB' },
    { label: 'Sub Managers', value: subAdminUsers.filter((user) => user.role === ROLES.SUB_ADMIN).length, color: '#F59E0B' },
    { label: 'Active', value: subAdminUsers.filter((user) => user.status === 'Active').length, color: '#16A34A' },
    { label: 'Locked', value: subAdminUsers.filter((user) => user.locked === true || user.locked === 'true').length, color: '#DC2626' },
  ]

  const closeModal = () => {
    setModal({ type: null, user: null })
    setCredentials(null)
    setOperationError('')
  }

  const openCreate = () => {
    setForm(DEFAULT_FORM)
    setCredentials(null)
    setOperationError('')
    setModal({ type: 'create', user: null })
  }

  const openEdit = (user) => {
    setForm({
      username: user.username || '',
      password: '',
      name: user.name || '',
      email: user.email || '',
      role: storedRole(user.rawRole || user.role),
    })
    setCredentials(null)
    setOperationError('')
    setModal({ type: 'edit', user })
  }

  const handleSubmit = async () => {
    if (!form.username || !form.name || !form.email || (modal.type === 'create' && !form.password)) return
    setSaving(true)
    setOperationError('')

    try {
      if (modal.type === 'create') {
        const result = await createUser(form)
        setCredentials({ username: form.username, password: result.generatedPassword || form.password, role: form.role, name: form.name })
        setModal({ type: 'credentials', user: result.newUser })
        return
      }

      if (modal.type === 'edit' && modal.user) {
        await updateUser(modal.user.id, form)
        closeModal()
      }
    } catch (nextError) {
      setOperationError(nextError.message || 'Unable to save sub admin.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this sub admin?')) return
    setOperationError('')
    try {
      await deleteUser(userId)
    } catch (nextError) {
      setOperationError(nextError.message || 'Unable to delete sub admin.')
    }
  }

  if (loading || usersLoading) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Sub Admin Management" sub="Loading managers and sub managers from Firebase" />
        <Card className="p-6"><div className="text-sm font-semibold text-[var(--text-muted)]">Loading sub admin data...</div></Card>
      </div>
    )
  }

  if (unauthorized) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Sub Admin Management" sub="Access restricted" />
        <EmptyState title="Unauthorized" description={error || 'Your current admin account does not have access to manage sub admins.'} />
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Sub Admin Management"
        sub="Manage managers and sub managers with the same Firebase fields as the old admin panel."
        action={<Btn v="primary" onClick={openCreate} disabled={!hasPermission(PERMISSIONS.manageAdmins)}>Add Sub Admin</Btn>}
      />

      {operationError ? <Card className="border-red-500/30 p-4 text-sm font-bold text-red-600">{operationError}</Card> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {securitySummary.map((item) => (
          <SectionCard key={item.label} title={item.label} className="!p-4 h-full">
            <div className="text-[28px] font-extrabold leading-none" style={{ color: item.color }}>{item.value}</div>
          </SectionCard>
        ))}
      </div>

      <Card className="p-4">
        <ListToolbar
          title="Sub admin management table"
          subtitle="Create, edit, and delete manager and sub manager accounts."
          resultLabel={`${filteredUsers.length} of ${subAdminUsers.length} sub admin accounts shown`}
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search by username, name, email, or role"
          actions={<Badge label={hasPermission(PERMISSIONS.manageAdmins) ? 'Full access enabled' : 'Restricted'} color={hasPermission(PERMISSIONS.manageAdmins) ? '#16A34A' : '#F59E0B'} />}
          filters={(
            <>
              <select value={filters.role} onChange={(event) => setFilters({ role: event.target.value })} className="h-11 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 text-sm font-semibold text-[var(--text-main)]">
                <option value="">All roles</option>
                <option value={ROLES.ADMIN}>Manager</option>
                <option value={ROLES.SUB_ADMIN}>Sub Manager</option>
              </select>
              <Btn v="ghost" size="sm" onClick={() => { setQuery(''); setFilters({ role: '' }) }}>Reset</Btn>
            </>
          )}
          className="mb-4"
        />

        {filteredUsers.length > 0 ? (
          <DataTable cols={COLS}>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TD><span className="font-bold text-[var(--text-main)]">{user.username || 'No username'}</span></TD>
                <TD>{user.name}</TD>
                <TD>{user.email}</TD>
                <TD><Badge label={displayRole(user.role)} color={user.role === ROLES.ADMIN ? '#2563EB' : '#F59E0B'} /></TD>
                <TD>{formatDate(user.createdDate || user.createdAt)}</TD>
                <TD>{formatDate(user.lastLogin) === 'N/A' ? 'Never' : formatDate(user.lastLogin)}</TD>
                <TD>
                  <div className="flex flex-wrap gap-2">
                    <Btn size="xs" v="outline" onClick={() => openEdit(user)} disabled={!hasPermission(PERMISSIONS.manageAdmins)}>Edit</Btn>
                    <Btn size="xs" v="danger" onClick={() => handleDelete(user.id)} disabled={!hasPermission(PERMISSIONS.manageAdmins)}>Delete</Btn>
                  </div>
                </TD>
              </TableRow>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No sub admins found" description="Try clearing the filters or add a new sub admin." action={<Btn v="outline" onClick={() => { setQuery(''); setFilters({ role: '' }) }}>Clear filters</Btn>} />
        )}
      </Card>

      <Modal
        isOpen={modal.type === 'create' || modal.type === 'edit'}
        title={modal.type === 'create' ? 'Add New Sub Admin' : 'Edit Sub Admin'}
        onClose={closeModal}
        size="md"
        footer={(
          <>
            <Btn v="outline" onClick={closeModal}>Cancel</Btn>
            <Btn v="primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : modal.type === 'create' ? 'Create' : 'Update'}</Btn>
          </>
        )}
      >
        {operationError ? <div className="mb-4 text-sm font-bold text-red-600">{operationError}</div> : null}
        <AdminForm value={form} onChange={setForm} editing={modal.type === 'edit'} />
      </Modal>

      <Modal
        isOpen={modal.type === 'credentials'}
        title="Share User Credentials"
        onClose={closeModal}
        size="md"
        footer={<Btn v="primary" onClick={closeModal}>Done</Btn>}
      >
        <CredentialsPanel credentials={credentials} />
      </Modal>
    </div>
  )
}
