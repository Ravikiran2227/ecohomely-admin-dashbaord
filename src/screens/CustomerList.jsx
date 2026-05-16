import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import FilterPills from '../components/FilterPills'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import ListToolbar from '../components/ListToolbar'
import { DataTable, TableRow, TD } from '../components/Table'
import { C } from '../theme'
import { loadCustomers } from '../utils/customerStorage'

function Avatar({ name, size = 40 }) {
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  const colors = ['bg-brand-500/20 border-brand-500/40 text-brand-600 dark:text-brand-400', 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400', 'bg-purple-500/20 border-purple-500/40 text-purple-600 dark:text-purple-400', 'bg-blue-500/20 border-blue-500/40 text-blue-600 dark:text-blue-400']
  const colorClass = colors[name.charCodeAt(0) % colors.length]
  
  return (
    <div 
      className={`rounded-full flex items-center justify-center font-bold border-2 shrink-0 ${colorClass}`}
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials}
    </div>
  )
}

function ActionMenu({ customer, navigate }) {
  const [open, setOpen] = useState(false)
  const actions = [
    { label: 'View Profile',   icon: 'eye',      fn: () => navigate(`/customers/${customer.id}`) },
    { label: 'Edit Profile',   icon: 'edit',     fn: () => navigate(`/customers/${customer.id}?edit=true`) },
    { label: 'Send Message',   icon: 'send',     fn: () => {} },
    { label: 'View Bookings',  icon: 'calendar', fn: () => navigate('/bookings') },
    {
      label: customer.status === 'Active' ? 'Block Customer' : 'Unblock',
      icon: customer.status === 'Active' ? 'close' : 'check',
      fn: () => {}, danger: customer.status === 'Active',
    },
    { label: 'Delete Account', icon: 'trash', fn: () => {}, danger: true },
  ]

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(p => !p) }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
          open ? 'bg-[var(--bg-main)] border border-[var(--border-main)]' : 'hover:bg-[var(--bg-main)]'
        }`}
      >
        <Icon n="dots" sz={16} className="text-[var(--text-muted)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-48 bg-[var(--card-bg)] rounded-xl border border-[var(--border-main)] shadow-xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); a.fn(); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs font-bold transition-colors border-b last:border-0 border-[var(--border-main)] ${
                  a.danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10' : 'text-[var(--text-main)] hover:bg-[var(--bg-main)]'
                }`}
              >
                <Icon n={a.icon} sz={14} className={a.danger ? 'text-red-500' : 'text-[var(--text-muted)]'} />
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const STATUS_COLOR = { Active: C.success, Blocked: C.danger, Inactive: C.danger }
const PAGE_SIZE = 15

const COLS = [
  { label: '#' }, { label: 'Customer' }, { label: 'Phone' },
  { label: 'Area' }, { label: 'Bookings' }, { label: 'Complaints' },
  { label: 'Device' }, { label: 'Joined' }, { label: 'Status' },
  { label: 'Actions', w: 60 },
]

export default function CustomerList() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [customerRecords, setCustomerRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const loadCustomerRecords = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      setCustomerRecords(await loadCustomers())
    } catch (loadError) {
      setError(loadError.message || 'Unable to load customers.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCustomerRecords()
  }, [loadCustomerRecords])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const filtered = customerRecords.filter(c => {
    const matchStatus = statusFilter === 'All' || c.status === statusFilter
    const matchSearch = String(c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      String(c.email || '').toLowerCase().includes(search.toLowerCase()) ||
      String(c.area || '').toLowerCase().includes(search.toLowerCase()) ||
      String(c.phone || '').includes(search)
    return matchStatus && matchSearch
  })
  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedCustomers = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageNumbers = (() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  })()

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Customers"
        sub={`${customerRecords.length} total customers registered`}
        action={
          <Btn v="primary" icon={<Icon n="edit" sz={14} cl="#fff" />}>Export CSV</Btn>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total', value: customerRecords.length, color: 'border-brand-500', text: 'text-brand-600' },
          { label: 'Active', value: customerRecords.filter(c => c.status === 'Active').length, color: 'border-emerald-500', text: 'text-emerald-600' },
          { label: 'Inactive', value: customerRecords.filter(c => c.status === 'Inactive').length, color: 'border-red-500', text: 'text-red-600' },
          { label: 'With Complaints', value: customerRecords.filter(c => c.complaints > 0).length, color: 'border-amber-500', text: 'text-amber-600' },
        ].map((s, i) => (
          <Card key={i} className={`border-l-4 ${s.color} p-4.5 shadow-sm`}>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">{s.label}</p>
            <p className={`text-2xl font-black ${s.text}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      <ListToolbar
        title="Browse customers"
        subtitle="Use the status pills and quick search to move between active, blocked, and complaint-heavy accounts."
        resultLabel={`${pagedCustomers.length} of ${filtered.length} customers shown`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, phone, or area..."
        actions={<Btn v="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('All') }}>Reset</Btn>}
        filters={(
          <FilterPills
            options={['All', 'Active', 'Inactive', 'Blocked']}
            active={statusFilter}
            onChange={setStatusFilter}
          />
        )}
      />

      {loading ? (
        <EmptyState
          icon="clock"
          title="Loading customers"
          description="Fetching customer records from the backend."
        />
      ) : error ? (
        <EmptyState
          icon="alert"
          title="Unable to load customers"
          description={error}
          action={<Btn v="outline" onClick={loadCustomerRecords}>Retry</Btn>}
        />
      ) : filtered.length > 0 ? (
        <>
        <DataTable cols={COLS}>
          {pagedCustomers.map((c, i) => (
            <TableRow
              key={c.id}
              highlight={c.status === 'Blocked'}
              onClick={() => navigate(`/customers/${c.id}`)}
            >
              <TD className="text-xs font-bold text-[var(--text-muted)] w-12">{((safePage - 1) * PAGE_SIZE) + i + 1}</TD>
              <TD>
                <div className="flex items-center gap-3.5 py-1">
                  <Avatar name={c.name} />
                  <div className="min-w-0">
                    <p className="font-extrabold text-sm text-[var(--text-main)] truncate">{c.name}</p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-tighter lowercase">{c.email || 'No email'}</p>
                  </div>
                </div>
              </TD>
              <TD className="font-mono text-xs text-[var(--text-muted)]">{c.phone}</TD>
              <TD className="text-xs font-medium text-[var(--text-main)] max-w-[140px] truncate">{c.area}</TD>
              <TD>
                <span className={`text-sm font-black ${c.bookings > 0 ? 'text-brand-600' : 'text-[var(--text-muted)]'}`}>
                  {c.bookings}
                </span>
              </TD>
              <TD>
                <span className={`text-sm font-black ${c.complaints > 0 ? 'text-red-600' : 'text-[var(--text-muted)]'}`}>
                  {c.complaints}
                </span>
              </TD>
              <TD className="text-xs font-medium text-[var(--text-muted)]">{c.device}</TD>
              <TD className="text-[11px] font-bold text-[var(--text-muted)] whitespace-nowrap">{c.dateJoined}</TD>
              <TD>
                <Badge label={c.status} color={STATUS_COLOR[c.status] || C.muted} size="xs" />
              </TD>
              <TD onClick={e => e.stopPropagation()}>
                <ActionMenu customer={c} navigate={navigate} />
              </TD>
            </TableRow>
          ))}
        </DataTable>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-xs font-bold text-[var(--text-muted)]">
            Page {safePage} of {pageCount} · Showing {pagedCustomers.length} records
          </div>
          <div className="flex items-center gap-1.5">
            <Btn v="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</Btn>
            {pageNumbers[0] > 1 && (
              <>
                <Btn v="outline" size="sm" onClick={() => setPage(1)}>1</Btn>
                {pageNumbers[0] > 2 && <span className="px-1 text-xs font-bold text-[var(--text-muted)]">...</span>}
              </>
            )}
            {pageNumbers.map((pageNumber) => (
              <Btn
                key={pageNumber}
                v={pageNumber === safePage ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setPage(pageNumber)}
                className="min-w-9 px-3"
              >
                {pageNumber}
              </Btn>
            ))}
            {pageNumbers[pageNumbers.length - 1] < pageCount && (
              <>
                {pageNumbers[pageNumbers.length - 1] < pageCount - 1 && <span className="px-1 text-xs font-bold text-[var(--text-muted)]">...</span>}
                <Btn v="outline" size="sm" onClick={() => setPage(pageCount)}>{pageCount}</Btn>
              </>
            )}
            <Btn v="outline" size="sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(current + 1, pageCount))}>Next</Btn>
          </div>
        </Card>
        </>
      ) : (
        <EmptyState
          title="No customers found"
          description="Adjust the search or switch the status filter to restore matching customers."
          action={<Btn v="outline" onClick={() => { setSearch(''); setStatusFilter('All') }}>Clear filters</Btn>}
        />
      )}
    </div>
  )
}
