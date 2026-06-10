import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import { DataTable, TableRow, TD } from '../components/Table'
import { C } from '../theme'
import { loadCustomers } from '../utils/customerStorage'
import customersApi from '../services/customersApi'

function Avatar({ name = '', photoUrl = '', size = 40 }) {
  const initials = String(name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  const colors = ['bg-brand-500/20 border-brand-500/40 text-brand-600 dark:text-brand-400', 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400', 'bg-purple-500/20 border-purple-500/40 text-purple-600 dark:text-purple-400', 'bg-blue-500/20 border-blue-500/40 text-blue-600 dark:text-blue-400']
  const colorClass = colors[(name || 'C').charCodeAt(0) % colors.length]

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || 'Customer'}
        className="rounded-full object-cover border-2 shrink-0 border-brand-500/30"
        style={{ width: size, height: size }}
      />
    )
  }
  
  return (
    <div 
      className={`rounded-full flex items-center justify-center font-bold border-2 shrink-0 ${colorClass}`}
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials || 'C'}
    </div>
  )
}

function ActionMenu({ customer, navigate, onDelete }) {
  const [open, setOpen] = useState(false)
  const actions = [
    { label: 'View Profile',   icon: 'eye',      fn: () => navigate(`/customers/${customer.id}`) },
    { label: 'Edit Profile',   icon: 'edit',     fn: () => navigate(`/customers/${customer.id}?edit=true`) },
    { label: 'View Bookings',  icon: 'calendar', fn: () => navigate('/bookings') },
    { label: 'Delete Account', icon: 'trash', fn: () => onDelete(customer), danger: true },
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

const SORT_OPTIONS = [
  { id: 'createdDate', name: 'Sort By Created Date' },
  { id: 'name', name: 'Sort By Name' },
  { id: 'email', name: 'Sort By Email' },
  { id: 'phone', name: 'Sort By Phone' },
  { id: 'bookings', name: 'Sort By Bookings' },
]

const STATUS_OPTIONS = [
  { id: 'all', name: 'All Status' },
  { id: 'Active', name: 'Active' },
  { id: 'Inactive', name: 'Inactive' },
  { id: 'Blocked', name: 'Blocked' },
]

const PERIOD_OPTIONS = [
  { id: 'total', name: 'Total' },
  { id: 'today', name: 'Today' },
  { id: 'last7', name: 'Last 7 Days' },
  { id: 'month', name: 'This Month' },
]

function parseCustomerDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000)
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function getCustomerCreatedDate(customer = {}) {
  return parseCustomerDate(customer.dateJoined || customer.joinedAt || customer.createdAt || customer.registeredAt || customer.updatedAt)
}

function matchesPeriod(date, period) {
  if (!period || period === 'total') return true
  if (!date) return false

  const now = new Date()
  if (period === 'today') {
    return date >= startOfDay(now) && date <= endOfDay(now)
  }
  if (period === 'last7') {
    const start = startOfDay(now)
    start.setDate(start.getDate() - 6)
    return date >= start && date <= endOfDay(now)
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    return date >= start && date <= end
  }
  return true
}

function matchesDateRange(date, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true
  if (!date) return false
  const from = dateFrom ? startOfDay(new Date(dateFrom)) : null
  const to = dateTo ? endOfDay(new Date(dateTo)) : null
  return (!from || date >= from) && (!to || date <= to)
}

function FilterDropdown({ value, onChange, options, ariaLabel, minWidth = 'min-w-[160px]' }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const selected = options.find((option) => String(option.id) === String(value)) || options[0]

  useEffect(() => {
    if (!open) return undefined

    const closeOnOutsideClick = (event) => {
      if (!dropdownRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  return (
    <div ref={dropdownRef} className={`relative ${open ? 'z-[200]' : 'z-10'} ${minWidth}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-[var(--border-main)] bg-[var(--card-bg)] px-4 text-left text-sm font-bold text-[var(--text-main)] shadow-sm transition-all hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      >
        <span className="truncate">{selected?.name}</span>
        <span className={`text-sm text-[var(--color-primary)] transition-transform ${open ? 'rotate-180' : ''}`}>v</span>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[220] max-h-72 w-full min-w-[190px] overflow-y-auto rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.32)]">
          {options.map((option) => {
            const active = String(option.id) === String(value)
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id)
                  setOpen(false)
                }}
                className={`mt-1 first:mt-0 w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                  active
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--text-main)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--card-bg))] hover:text-[var(--color-primary)]'
                }`}
              >
                {option.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CustomerDateInput({ value, onChange, label }) {
  return (
    <input
      type="date"
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 min-w-[150px] rounded-lg border border-[var(--border-main)] bg-[var(--card-bg)] px-4 text-sm font-bold text-[var(--text-main)] shadow-sm transition-all placeholder:text-[var(--text-muted)] hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-brand-500/15"
    />
  )
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const COLS = [
  { label: '#' }, { label: 'Customer' }, { label: 'Phone' },
  { label: 'Area' }, { label: 'Bookings' },
  { label: 'Device' }, { label: 'Joined' }, { label: 'Status' },
  { label: 'Actions', w: 60 },
]

export default function CustomerList() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('createdDate')
  const [periodFilter, setPeriodFilter] = useState('total')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
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
  }, [search, statusFilter, sortBy, periodFilter, dateFrom, dateTo])

  const filtered = customerRecords
    .filter(c => {
      const createdDate = getCustomerCreatedDate(c)
      const matchStatus = statusFilter === 'all' || c.status === statusFilter
      const query = search.trim().toLowerCase()
      const matchSearch = !query ||
        String(c.name || '').toLowerCase().includes(query) ||
        String(c.email || '').toLowerCase().includes(query) ||
        String(c.area || '').toLowerCase().includes(query) ||
        String(c.phone || '').toLowerCase().includes(query) ||
        String(c.device || '').toLowerCase().includes(query)
      return matchStatus && matchSearch && matchesPeriod(createdDate, periodFilter) && matchesDateRange(createdDate, dateFrom, dateTo)
    })
    .sort((left, right) => {
      if (sortBy === 'name') return String(left.name || '').localeCompare(String(right.name || ''))
      if (sortBy === 'email') return String(left.email || '').localeCompare(String(right.email || ''))
      if (sortBy === 'phone') return String(left.phone || '').localeCompare(String(right.phone || ''))
      if (sortBy === 'bookings') return Number(right.bookings || 0) - Number(left.bookings || 0)
      return (getCustomerCreatedDate(right)?.getTime() || 0) - (getCustomerCreatedDate(left)?.getTime() || 0)
    })
  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedCustomers = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageNumbers = (() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  })()

  const exportCustomers = () => {
    const rows = [
      ['S.No', 'Customer', 'Email', 'Phone', 'Area', 'Bookings', 'Device', 'Joined', 'Status'],
      ...filtered.map((customer, index) => [
        index + 1,
        customer.name,
        customer.email || '',
        customer.phone || '',
        customer.area || '',
        customer.bookings ?? 0,
        customer.device || '',
        customer.dateJoined || '',
        customer.status || '',
      ]),
    ]

    downloadCsv(`Customers_Export_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const deleteCustomer = async (customer) => {
    if (!window.confirm(`Delete ${customer.name || 'this customer'} and all uploaded files?`)) return
    await customersApi.deleteCustomer(customer.id)
    loadCustomerRecords()
  }

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setSortBy('createdDate')
    setPeriodFilter('total')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Customers"
        sub={`${customerRecords.length} total customers registered`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          { label: 'Total', value: customerRecords.length, color: 'border-brand-500', text: 'text-brand-600' },
          { label: 'Active', value: customerRecords.filter(c => c.status === 'Active').length, color: 'border-emerald-500', text: 'text-emerald-600' },
          { label: 'Inactive', value: customerRecords.filter(c => c.status === 'Inactive').length, color: 'border-red-500', text: 'text-red-600' },
        ].map((s, i) => (
          <Card key={i} className={`border-l-4 ${s.color} p-4.5 shadow-sm`}>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">{s.label}</p>
            <p className={`text-2xl font-black ${s.text}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="relative z-50 overflow-visible p-4.5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-black text-[var(--text-main)]">Customers List</h2>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {pagedCustomers.length} of {filtered.length} customers shown
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[260px] flex-1 xl:flex-none">
              <Icon n="search" sz={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, customer, phone..."
                className="h-11 w-full rounded-lg border border-[var(--border-main)] bg-[var(--card-bg)] pl-11 pr-4 text-sm font-semibold text-[var(--text-main)] shadow-sm outline-none transition-all placeholder:text-[var(--text-muted)] hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <FilterDropdown value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} ariaLabel="Sort customers" minWidth="min-w-[190px]" />
            <FilterDropdown value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} ariaLabel="Filter customer status" minWidth="min-w-[150px]" />
            <CustomerDateInput value={dateFrom} onChange={setDateFrom} label="From date" />
            <CustomerDateInput value={dateTo} onChange={setDateTo} label="To date" />
            <FilterDropdown value={periodFilter} onChange={setPeriodFilter} options={PERIOD_OPTIONS} ariaLabel="Filter customer period" minWidth="min-w-[135px]" />
            <Btn v="primary" icon={<Icon n="edit" sz={14} cl="#fff" />} onClick={exportCustomers} disabled={filtered.length === 0}>Export</Btn>
            <Btn v="ghost" size="sm" onClick={resetFilters}>Reset</Btn>
          </div>
        </div>
      </Card>

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
        <DataTable cols={COLS} className="relative z-0">
          {pagedCustomers.map((c, i) => (
            <TableRow
              key={c.id}
              highlight={c.status === 'Blocked'}
              onClick={() => navigate(`/customers/${c.id}`)}
            >
              <TD className="text-xs font-bold text-[var(--text-muted)] w-12">{((safePage - 1) * PAGE_SIZE) + i + 1}</TD>
              <TD>
                <div className="flex items-center gap-3.5 py-1">
                  <Avatar name={c.name} photoUrl={c.photoUrl} />
                  <div className="min-w-0">
                    <p className="font-extrabold text-sm text-[var(--text-main)] truncate">{c.name}</p>
                    {c.email && <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-tighter lowercase">{c.email}</p>}
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
              <TD className="text-xs font-medium text-[var(--text-muted)]">{c.device || '-'}</TD>
              <TD className="text-[11px] font-bold text-[var(--text-muted)] whitespace-nowrap">{c.dateJoined}</TD>
              <TD>
                <Badge label={c.status} color={STATUS_COLOR[c.status] || C.muted} size="xs" />
              </TD>
              <TD onClick={e => e.stopPropagation()}>
                <ActionMenu customer={c} navigate={navigate} onDelete={deleteCustomer} />
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
          action={<Btn v="outline" onClick={resetFilters}>Clear filters</Btn>}
        />
      )}
    </div>
  )
}
