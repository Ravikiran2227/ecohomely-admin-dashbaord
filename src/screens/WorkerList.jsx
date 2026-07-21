import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import {
  getLocationLabel,
  getPrimaryProfession,
  isMultiSkilled,
} from '../data/workerSystem'
import Icon from '../components/Icon'
import ListToolbar from '../components/ListToolbar'
import { Card } from '../components/Card'
import { DataTable, TableRow, TD } from '../components/Table'
import locationsApi from '../services/locationsApi'
import workersApi from '../services/workersApi'
import { resolveWorkerAssetUrl } from '../services/firebaseClient'
import { correctionSubmittedAt, hasWorkerResubmittedCorrection } from '../utils/profileUpdateNotifications'

function FilterField({ value, onChange, options, placeholder, icon }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((item) => String(item.id || item) === String(value))
  const label = selected?.name || selected || placeholder

  return (
    <div className="relative z-[60] group min-w-[116px]">
      {icon && (
        <div className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-dark-400 transition-colors group-hover:text-brand-500">
          <Icon n={icon} sz={14} cl="currentColor" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-primary)_28%,var(--border-main))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_96%,transparent),color-mix(in_srgb,var(--bg-main)_82%,var(--card-bg)))] ${icon ? 'pl-9' : 'pl-3'} pr-3 text-left text-xs font-extrabold text-[var(--text-main)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_6%,transparent)] transition-all hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-brand-500/15`}
      >
        <span className={`truncate ${value && !String(placeholder).toLowerCase().startsWith('sort by') ? '' : 'text-[var(--text-muted)]'}`}>{label}</span>
        <span className={`text-sm leading-none text-brand-500 transition-transform ${open ? 'rotate-180' : ''}`}>v</span>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[999] max-h-72 w-full min-w-[180px] overflow-auto rounded-2xl border border-[color:color-mix(in_srgb,var(--color-primary)_24%,var(--border-main))] bg-[var(--card-bg)] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              onChange('')
              setOpen(false)
            }}
            className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-extrabold transition-colors ${!value ? 'bg-brand-500 text-white' : 'text-[var(--text-muted)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--card-bg))] hover:text-brand-600'}`}
          >
            {placeholder}
          </button>
          {options.map((item) => {
            const optionValue = item.id || item
            const optionLabel = item.name || item
            const active = String(optionValue) === String(value)
            return (
              <button
                key={optionValue}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(optionValue)
                  setOpen(false)
                }}
                className={`mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-extrabold transition-colors ${active ? 'bg-brand-500 text-white shadow-sm' : 'text-[var(--text-main)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--card-bg))] hover:text-brand-600'}`}
              >
                {optionLabel}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DateFilter({ value, onChange, placeholder }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 min-w-[132px] rounded-xl border border-[color:color-mix(in_srgb,var(--color-primary)_28%,var(--border-main))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_96%,transparent),color-mix(in_srgb,var(--bg-main)_82%,var(--card-bg)))] px-3 text-xs font-extrabold text-[var(--text-muted)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_6%,transparent)] transition-all placeholder-[var(--text-muted)] hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      aria-label={placeholder}
      title={placeholder}
    />
  )
}

const emptyFilters = {
  state_id: '',
  district_id: '',
  city_id: '',
  area_id: '',
  profession: '',
  planType: '',
  availability: '',
  approvalStatus: '',
  period: '',
  dateFrom: '',
  dateTo: '',
  sortBy: 'date',
}

const SORT_OPTIONS = [
  { id: 'date', name: 'Sort By Date' },
  { id: 'id', name: 'Sort By ID' },
  { id: 'name', name: 'Sort By Name' },
  { id: 'profession', name: 'Sort By Profession' },
  { id: 'rating', name: 'Sort By Rating' },
  { id: 'device', name: 'Sort By Device' },
  { id: 'flagged', name: 'Sort By Flagged' },
  { id: 'accountEdited', name: 'Sort By Account Edited' },
  { id: 'verification', name: 'Sort By Verification Badge' },
  { id: 'unpaidNotApproved', name: 'Sort By Not Paid & Not Approved' },
]

const APPROVAL_OPTIONS = [
  { id: 'approved', name: 'Approved' },
  { id: 'notApproved', name: 'Not Approved' },
]

const PERIOD_OPTIONS = [
  { id: 'today', name: 'Today' },
  { id: 'last7', name: 'Last 7 Days' },
  { id: 'month', name: 'This Month' },
  { id: 'total', name: 'Total' },
]

const MEMBERSHIP_BADGES = {
  gold: {
    label: 'Gold Member',
    className: 'border-[#d7a82f]/70 bg-[linear-gradient(100deg,#d9a72f_0%,#fff3ad_48%,#b88513_100%)] text-[#33240a] shadow-[0_8px_18px_rgba(217,167,47,0.2)]',
    medalClassName: 'bg-[#fff6c7] text-[#b88513]',
  },
  silver: {
    label: 'Silver Member',
    className: 'border-slate-300/70 bg-[linear-gradient(100deg,#a7b0bd_0%,#f8fafc_48%,#7c8795_100%)] text-[#202734] shadow-[0_8px_18px_rgba(148,163,184,0.18)]',
    medalClassName: 'bg-white text-slate-600',
  },
  bronze: {
    label: 'Bronze Member',
    className: 'border-orange-700/60 bg-[linear-gradient(100deg,#a95b25_0%,#ffd0a3_48%,#7c3414_100%)] text-[#2f1608] shadow-[0_8px_18px_rgba(194,65,12,0.18)]',
    medalClassName: 'bg-[#ffe4c2] text-orange-800',
  },
}

function getMembershipBadge(worker = {}) {
  const key = String(worker.membership || 'gold').trim().toLowerCase()
  return MEMBERSHIP_BADGES[key] || MEMBERSHIP_BADGES.gold
}

function MembershipBadge({ badge }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${badge.className}`}>
      <span className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full ${badge.medalClassName}`}>
        <span className="block h-2 w-2 rounded-full bg-current" />
      </span>
      {badge.label}
    </span>
  )
}

const PAGE_SIZE = 15
const workerAvatarCache = new Map()

function getWorkerAvatarCacheKey(worker = {}) {
  return [
    worker.id,
    worker.uid,
    worker.authId,
    worker.profilePhoto,
    worker.profilePhotoUrl,
    worker.profileImage,
    worker.imageUrl,
    worker.image,
    worker.photoUrl,
    worker.updatedAt,
  ].filter(Boolean).join('|')
}

function WorkerAvatar({ worker, priority = false }) {
  const cacheKey = getWorkerAvatarCacheKey(worker)
  const [src, setSrc] = useState(() => workerAvatarCache.get(cacheKey) || '')
  const [failed, setFailed] = useState(false)
  const initial = worker?.name?.[0] || 'W'

  useEffect(() => {
    let alive = true
    setFailed(false)

    if (!cacheKey) {
      setSrc('')
      return () => {
        alive = false
      }
    }

    const cached = workerAvatarCache.get(cacheKey)
    if (cached) {
      setSrc(cached)
      return () => {
        alive = false
      }
    }

    setSrc('')
    resolveWorkerAssetUrl(worker, 'profile')
      .then((url) => {
        if (!alive || !url) return
        workerAvatarCache.set(cacheKey, url)
        setSrc(url)
      })
      .catch(() => {
        if (alive) setSrc('')
      })

    return () => {
      alive = false
    }
  }, [cacheKey, worker])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={worker?.name || 'Worker'}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onError={() => setFailed(true)}
        className="h-10 w-10 rounded-xl border border-[var(--border-main)] object-cover shadow-sm"
      />
    )
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-main)] bg-gradient-to-br from-dark-100 to-dark-200 text-sm font-bold text-dark-700 dark:from-dark-900 dark:to-dark-800 dark:text-dark-300">
      {initial}
    </div>
  )
}

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function readNested(source = {}, path = '') {
  return String(path)
    .split('.')
    .reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source)
}

function labelOf(value) {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    return firstText(
      value.profession,
      value.professionName,
      value.name,
      value.title,
      value.label,
      value.categoryName,
      value.serviceName,
      value.serviceType,
      value.type,
    ) || ''
  }
  return ''
}

function firstArrayLabel(value) {
  return Array.isArray(value) ? labelOf(value.find((item) => labelOf(item))) : ''
}

function getProfessionLabel(worker) {
  return firstText(
    getPrimaryProfession(worker)?.profession,
    worker.profession,
    worker.primaryProfession,
    worker.professionName,
    worker.professionalCategory,
    worker.categoryName,
    worker.category,
    worker.serviceName,
    worker.serviceType,
    worker.serviceProvided,
    worker.servicesProvided,
    worker.serviceCategory,
    worker.selectedCategory,
    worker.subCategory,
    worker.workCategory,
    worker.selectedService,
    worker.workerType,
    worker.workType,
    worker.skill,
    labelOf(worker.professionDetails),
    labelOf(worker.professionalDetails),
    labelOf(worker.serviceDetails),
    labelOf(worker.businessDetails),
    labelOf(worker.workDetails),
    labelOf(worker.profile),
    firstArrayLabel(worker.skills),
    firstArrayLabel(worker.services),
    firstArrayLabel(worker.serviceList),
    firstArrayLabel(worker.categories),
  ) || 'Not set'
}

function getPaymentInfo(worker) {
  const couponCode = firstText(
    worker.couponCode,
    worker.couponCodeUsed,
    worker.appliedCouponCode,
    readNested(worker, 'coupon.code'),
    readNested(worker, 'coupon.couponCode'),
    readNested(worker, 'appliedCoupon.code'),
    readNested(worker, 'couponDetails.code'),
  )
  const couponApplied = firstText(
    worker.couponApplied,
    worker.couponUsed,
    worker.usedCoupon,
    readNested(worker, 'coupon.applied'),
  )
  const couponDiscountValue = firstText(
    worker.couponDiscount,
    worker.couponDiscountAmount,
    worker.discountAmount,
    readNested(worker, 'coupon.discount'),
    readNested(worker, 'coupon.discountValue'),
    readNested(worker, 'coupon.amount'),
    readNested(worker, 'appliedCoupon.discount'),
    readNested(worker, 'couponDetails.discount'),
  )
  const couponDiscount = Number(String(couponDiscountValue ?? '').replace(/[^\d.-]/g, ''))
  const usedCoupon = Boolean(
    (typeof couponCode === 'string' && couponCode.trim())
    || (Number.isFinite(couponDiscount) && couponDiscount > 0)
    || couponApplied === true
    || ['true', 'yes', 'applied', 'used', 'redeemed'].includes(String(couponApplied || '').toLowerCase())
  )
  const paidValue = firstText(
    worker.paid,
    worker.isPaid,
    worker.havePaid,
    worker.paymentDone,
    worker.subscriptionPaid,
    worker.paymentStatus,
    readNested(worker, 'payment.paid'),
    readNested(worker, 'payment.status'),
    readNested(worker, 'subscription.paid'),
    readNested(worker, 'subscription.paymentStatus'),
  )
  const paid = usedCoupon || paidValue === true || ['paid', 'yes', 'true', 'success', 'successful', 'completed', 'verified', 'active'].includes(String(paidValue).toLowerCase())
  const amountValue = firstText(
    worker.paymentAmount,
    worker.amountPaid,
    worker.paidAmount,
    worker.subscriptionAmount,
    worker.planAmount,
    readNested(worker, 'payment.amountPaid'),
    readNested(worker, 'payment.paidAmount'),
    readNested(worker, 'payment.amount'),
    readNested(worker, 'subscription.amountPaid'),
    readNested(worker, 'subscription.amount'),
  )
  const amountNumber = Number(String(amountValue ?? '').replace(/[^\d.-]/g, ''))
  const amount = usedCoupon || !paid
    ? 'Rs 0'
    : Number.isFinite(amountNumber) && amountNumber > 0
      ? `Rs ${amountNumber.toLocaleString('en-IN')}`
      : 'Rs 0'

  return { paid: paid ? 'Yes' : 'No', amount }
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds
    const milliseconds = value.milliseconds ?? value._milliseconds ?? value.millis ?? value._millis
    if (typeof milliseconds === 'number') return new Date(milliseconds)
    if (typeof seconds === 'number') return new Date(seconds * 1000)
  }
  if (typeof value === 'string') {
    const normalized = value
      .replace(/\s+at\s+/i, ' ')
      .replace(/UTC([+-]\d{1,2}):(\d{2})/i, 'GMT$1$2')
    const parsed = new Date(normalized)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

function formatDateOnly(value) {
  const date = toDate(value)
  if (!date) return 'N/A'
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('-')
}

function getDateMs(value) {
  const date = toDate(value)
  return date ? date.getTime() : 0
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

function getWorkerJoinedDateValue(worker = {}) {
  return firstText(
    worker.createdAt,
    worker.CreatedAt,
    worker.created_at,
    worker.createdOn,
    worker.created_on,
    worker.accountCreatedAt,
    worker.accountCreated,
    worker.registeredAt,
    worker.registrationDate,
    worker.joinedAt,
    worker.dateJoined,
    worker.createdDate,
  )
}

function getWorkerUpdatedDateValue(worker = {}) {
  return firstText(
    worker.correctionSubmittedAt,
    worker.resubmittedAt,
    worker.updatedAt,
    worker.UpdatedAt,
    worker.updated_at,
    worker.accountEditedAt,
    worker.profileUpdatedAt,
    worker.modifiedAt,
    worker.lastUpdatedAt,
  )
}

function compareCorrectionUpdatePriority(left = {}, right = {}) {
  const leftUpdatedAfterCorrection = hasWorkerResubmittedCorrection(left)
  const rightUpdatedAfterCorrection = hasWorkerResubmittedCorrection(right)
  if (leftUpdatedAfterCorrection !== rightUpdatedAfterCorrection) {
    return Number(rightUpdatedAfterCorrection) - Number(leftUpdatedAfterCorrection)
  }
  if (!leftUpdatedAfterCorrection) return 0

  const rightSubmittedAt = getDateMs(correctionSubmittedAt(right))
  const leftSubmittedAt = getDateMs(correctionSubmittedAt(left))
  return rightSubmittedAt - leftSubmittedAt
}

function getWorkerCreatedDate(worker) {
  return toDate(getWorkerJoinedDateValue(worker))
}

function matchesPeriod(date, period) {
  if (!period || period === 'total') return true
  if (!date) return false
  const today = startOfDay(new Date())
  if (period === 'today') return date >= today && date <= endOfDay(today)
  if (period === 'last7') {
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    return date >= sevenDaysAgo && date <= endOfDay(today)
  }
  if (period === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    return date >= monthStart && date <= endOfDay(today)
  }
  return true
}

function matchesDateRange(date, from, to) {
  if (!from && !to) return true
  if (!date) return false
  const fromDate = from ? startOfDay(new Date(from)) : null
  const toDateValue = to ? endOfDay(new Date(to)) : null
  return (!fromDate || date >= fromDate) && (!toDateValue || date <= toDateValue)
}

function isApproved(worker) {
  return worker.approvalStatus === 'Approved' || worker.Approved === true || worker.approved === true
}

function getDeviceType(worker) {
  return firstText(worker.deviceType, worker.device, worker.platform, worker.os, worker.phoneType) || 'N/A'
}

function getMainArea(worker) {
  return firstText(worker.areaName, worker.primaryArea, worker.serviceArea, worker.area) || 'N/A'
}

function getRating(worker) {
  const rating = firstText(worker.avgRating, worker.rating, worker.averageRating, worker.performance?.rating)
  return rating ? `${rating}/5` : 'N/A'
}

function getRatingNumber(worker) {
  const rating = firstText(worker.avgRating, worker.rating, worker.averageRating, worker.performance?.rating)
  const number = Number(String(rating || '').replace(/[^\d.]/g, ''))
  return Number.isFinite(number) ? number : 0
}

function isFlaggedWorker(worker = {}) {
  const moderationStatus = String(worker.moderationStatus || worker.flagStatus || '').toLowerCase()
  if (['resolved', 'removed', 'closed'].includes(moderationStatus)) return false
  return Boolean(
    worker.flagged
    || worker.isFlagged
    || worker.isFlaged
    || moderationStatus === 'under review'
    || moderationStatus === 'flagged'
    || String(worker.status || '').toLowerCase() === 'flagged'
  )
}

function isPaidWorker(worker) {
  return getPaymentInfo(worker).paid === 'Yes'
}

function compareBySort(left, right, sortBy) {
  if (sortBy === 'date' || sortBy === 'accountEdited') {
    const correctionPriority = compareCorrectionUpdatePriority(left, right)
    if (correctionPriority !== 0) return correctionPriority
  }
  if (sortBy === 'id') return String(left.id || '').localeCompare(String(right.id || ''))
  if (sortBy === 'name') return String(left.name || '').localeCompare(String(right.name || ''))
  if (sortBy === 'profession') return getProfessionLabel(left).localeCompare(getProfessionLabel(right))
  if (sortBy === 'rating') return getRatingNumber(right) - getRatingNumber(left) || String(left.name || '').localeCompare(String(right.name || ''))
  if (sortBy === 'device') return getDeviceType(left).localeCompare(getDeviceType(right))
  if (sortBy === 'flagged') return Number(isFlaggedWorker(right)) - Number(isFlaggedWorker(left)) || String(left.name || '').localeCompare(String(right.name || ''))
  if (sortBy === 'accountEdited') {
    const rightDate = getDateMs(getWorkerUpdatedDateValue(right))
    const leftDate = getDateMs(getWorkerUpdatedDateValue(left))
    return rightDate - leftDate || String(left.name || '').localeCompare(String(right.name || ''))
  }
  if (sortBy === 'verification') return String(right.approvalStatus || '').localeCompare(String(left.approvalStatus || '')) || String(left.name || '').localeCompare(String(right.name || ''))
  if (sortBy === 'unpaidNotApproved') {
    const leftMatch = !isPaidWorker(left) && !isApproved(left)
    const rightMatch = !isPaidWorker(right) && !isApproved(right)
    return Number(rightMatch) - Number(leftMatch) || String(left.name || '').localeCompare(String(right.name || ''))
  }

  const rightDate = getDateMs(getWorkerJoinedDateValue(right))
  const leftDate = getDateMs(getWorkerJoinedDateValue(left))
  return rightDate - leftDate || String(left.name || '').localeCompare(String(right.name || ''))
}

function uniqueOptions(rows, idKeys, nameKeys) {
  const byName = new Map()
  rows.forEach((row) => {
    const name = firstText(...nameKeys.map((key) => row[key]))
    if (!name) return
    const id = firstText(...idKeys.map((key) => row[key]), name)
    byName.set(String(name).toLowerCase(), { id, name })
  })
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name))
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

function WorkerActionMenu({ worker, flagged, onReviews, onReject, onFlag, onUnflag, onDelete }) {
  const [open, setOpen] = useState(false)

  function toggleMenu(event) {
    event.stopPropagation()
    setOpen((current) => !current)
  }

  return (
    <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={toggleMenu}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] text-lg font-black leading-none text-[var(--text-muted)] hover:border-brand-500 hover:text-brand-500"
        aria-label={`Actions for ${worker.name || 'worker'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Actions"
      >
        ...
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-[90] mt-2 w-40 overflow-hidden rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-xl"
            role="menu"
          >
            <button
              type="button"
              onClick={(event) => {
                setOpen(false)
                onReviews(event, worker)
              }}
              className="w-full border-b border-[var(--border-main)] px-3 py-2.5 text-left text-xs font-bold text-[var(--text-main)] hover:bg-[var(--bg-main)]"
              role="menuitem"
            >
              Reviews
            </button>
            {flagged ? (
              <button
                type="button"
                onClick={(event) => {
                  setOpen(false)
                  onUnflag(event, worker)
                }}
                className="w-full border-b border-[var(--border-main)] px-3 py-2.5 text-left text-xs font-bold text-emerald-600 hover:bg-emerald-500/10"
                role="menuitem"
              >
                Unflag
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  setOpen(false)
                  onFlag(event, worker)
                }}
                className="w-full border-b border-[var(--border-main)] px-3 py-2.5 text-left text-xs font-bold text-amber-600 hover:bg-amber-500/10"
                role="menuitem"
              >
                Flag
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                setOpen(false)
                onReject(event, worker)
              }}
              className="w-full border-b border-[var(--border-main)] px-3 py-2.5 text-left text-xs font-bold text-red-500 hover:bg-red-500/10"
              role="menuitem"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={(event) => {
                setOpen(false)
                onDelete(event, worker)
              }}
              className="w-full border-t border-[var(--border-main)] px-3 py-2.5 text-left text-xs font-bold text-red-600 hover:bg-red-500/10"
              role="menuitem"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function WorkerList() {
  const navigate = useNavigate()
  const location = useLocation()
  const didInitPaginationRef = useRef(false)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [workers, setWorkers] = useState([])
  const [locationRows, setLocationRows] = useState({ states: [], districts: [], cities: [], areas: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(() => {
    const urlPage = Number(new URLSearchParams(window.location.search).get('page') || 1)
    return Number.isFinite(urlPage) && urlPage > 0 ? urlPage : 1
  })

  const stateOptions = useMemo(() => {
    const firebaseStates = uniqueOptions(locationRows.states, ['id', 'state_id', 'stateId'], ['name', 'stateName', 'state'])
    const workerStates = uniqueOptions(workers, ['state_id', 'stateId'], ['stateName', 'state'])
    return uniqueOptions([...firebaseStates, ...workerStates], ['id'], ['name'])
  }, [locationRows.states, workers])
  const districtOptions = useMemo(() => {
    const firebaseDistricts = uniqueOptions(locationRows.districts, ['id', 'district_id', 'districtId'], ['name', 'districtName', 'district'])
    const workerDistricts = uniqueOptions(workers, ['district_id', 'districtId'], ['districtName', 'district'])
    return uniqueOptions([...firebaseDistricts, ...workerDistricts], ['id'], ['name'])
  }, [locationRows.districts, workers])
  const cityOptions = useMemo(() => {
    const firebaseCities = uniqueOptions(locationRows.cities, ['id', 'city_id', 'cityId'], ['name', 'cityName', 'city'])
    const workerCities = uniqueOptions(workers, ['city_id', 'cityId'], ['cityName', 'city'])
    return uniqueOptions([...firebaseCities, ...workerCities], ['id'], ['name'])
  }, [locationRows.cities, workers])
  const areaOptions = useMemo(() => {
    const firebaseAreas = uniqueOptions(locationRows.areas, ['id', 'area_id', 'areaId'], ['name', 'areaName', 'area'])
    const workerAreas = uniqueOptions(workers, ['area_id', 'areaId'], ['areaName', 'primaryArea', 'serviceArea', 'area'])
    return uniqueOptions([...firebaseAreas, ...workerAreas], ['id'], ['name'])
  }, [locationRows.areas, workers])

  const loadWorkers = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      setWorkers(await workersApi.listWorkers())
    } catch (err) {
      setError(err.message || 'Unable to load workers.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWorkers()
    locationsApi.getHierarchy()
      .then((data) => setLocationRows({
        states: Array.isArray(data?.states) ? data.states : [],
        districts: Array.isArray(data?.districts) ? data.districts : [],
        cities: Array.isArray(data?.cities) ? data.cities : [],
        areas: Array.isArray(data?.areas) ? data.areas : [],
      }))
      .catch(() => setLocationRows({ states: [], districts: [], cities: [], areas: [] }))

    const intervalId = window.setInterval(() => {
      loadWorkers({ silent: true })
    }, 10000)
    const refreshOnFocus = () => {
      if (!document.hidden) loadWorkers({ silent: true })
    }

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [loadWorkers])

  useEffect(() => {
    if (!didInitPaginationRef.current) {
      didInitPaginationRef.current = true
      return
    }
    setPage(1)
  }, [filters, search])

  useEffect(() => {
    const requestedPage = Number(new URLSearchParams(location.search).get('page') || 1)
    if (Number.isFinite(requestedPage) && requestedPage > 0) {
      setPage(requestedPage)
    }
  }, [location.search])

  const sortedWorkers = useMemo(() => workers.slice().sort((left, right) => compareBySort(left, right, filters.sortBy)), [filters.sortBy, workers])

  const filtered = useMemo(() => sortedWorkers.filter((worker) => {
    const selectedState = stateOptions.find((item) => item.id === filters.state_id)?.name || ''
    const selectedDistrict = districtOptions.find((item) => item.id === filters.district_id)?.name || ''
    const selectedCity = cityOptions.find((item) => item.id === filters.city_id)?.name || ''
    const selectedArea = areaOptions.find((item) => item.id === filters.area_id)?.name || ''
    const locationLabel = getLocationLabel(worker)
    const text = `${worker.name} ${worker.phone} ${getProfessionLabel(worker)} ${locationLabel} ${getMainArea(worker)}`.toLowerCase()
    const profession = getProfessionLabel(worker).toLowerCase()
    const matchesState = !filters.state_id || worker.state_id === filters.state_id || worker.stateId === filters.state_id || String(worker.stateName || worker.state || '').toLowerCase() === selectedState.toLowerCase()
    const matchesDistrict = !filters.district_id || worker.district_id === filters.district_id || worker.districtId === filters.district_id || String(worker.districtName || worker.district || '').toLowerCase() === selectedDistrict.toLowerCase() || (selectedDistrict && locationLabel.toLowerCase().includes(selectedDistrict.toLowerCase()))
    const matchesCity = !filters.city_id || worker.city_id === filters.city_id || worker.cityId === filters.city_id || String(worker.cityName || worker.city || '').toLowerCase() === selectedCity.toLowerCase() || (selectedCity && locationLabel.toLowerCase().includes(selectedCity.toLowerCase()))
    const matchesArea = !filters.area_id || worker.area_id === filters.area_id || String(worker.areaName || worker.area || '').toLowerCase() === selectedArea.toLowerCase() || locationLabel.toLowerCase().includes(selectedArea.toLowerCase())
    const matchesProfession = !filters.profession || profession === String(filters.profession).toLowerCase()
    const matchesPlan = !filters.planType || String(worker.planType || '').toLowerCase() === String(filters.planType).toLowerCase()
    const matchesAvailability = !filters.availability || String(worker.availability || '').toLowerCase() === String(filters.availability).toLowerCase()
    const workerApproved = isApproved(worker)
    const matchesApproval = !filters.approvalStatus || (filters.approvalStatus === 'approved' ? workerApproved : !workerApproved)
    const createdDate = getWorkerCreatedDate(worker)
    const matchesDate = matchesPeriod(createdDate, filters.period) && matchesDateRange(createdDate, filters.dateFrom, filters.dateTo)
    const matchesSearch = !search || text.includes(search.toLowerCase())

    return matchesState && matchesDistrict && matchesCity && matchesArea && matchesProfession && matchesPlan && matchesAvailability && matchesApproval && matchesDate && matchesSearch
  }), [areaOptions, cityOptions, districtOptions, filters, search, sortedWorkers, stateOptions])
  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedWorkers = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage])
  const pending = workers.filter((worker) => worker.approvalStatus !== 'Approved').length
  const professionOptions = useMemo(() => [...new Set(workers.flatMap((w) => (w.professions || []).map((p) => p.profession)).filter(Boolean))], [workers])
  const COLS = [
    { label: 'S.No', w: '70px' },
    { label: 'Serviceman', w: '220px' },
    { label: 'Profession', w: '160px' },
    { label: 'Phone', w: '130px' },
    { label: 'Location', w: '220px' },
    { label: 'Main Area', w: '150px' },
    { label: 'Rating', w: '110px' },
    { label: 'Device Type', w: '130px' },
    { label: 'Joined Date', w: '130px' },
    { label: 'Payment', w: '150px' },
    { label: 'Approved By', w: '150px' },
    { label: 'Actions', w: '100px' },
  ]

  const pageNumbers = useMemo(() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  }, [pageCount, safePage])

  const resetFilters = () => {
    setSearch('')
    setFilters(emptyFilters)
  }

  const rejectWorker = async (event, worker) => {
    event.stopPropagation()
    if (!window.confirm(`Reject ${worker.name || 'this worker'}?`)) return
    await workersApi.rejectWorker(worker.id, { note: 'Rejected from worker directory' })
    loadWorkers()
  }

  const deleteWorker = async (event, worker) => {
    event.stopPropagation()
    if (!window.confirm(`Delete ${worker.name || 'this worker'} and all uploaded files?`)) return
    await workersApi.deleteWorker(worker.id)
    loadWorkers()
  }

  const flagWorker = async (event, worker) => {
    event.stopPropagation()
    await workersApi.updateWorker(worker.id, {
      flagged: true,
      isFlagged: true,
      isFlaged: true,
      moderationStatus: 'Under Review',
      flagStatus: 'Flagged',
      flaggedAt: new Date().toISOString(),
    })
    loadWorkers()
  }

  const unflagWorker = async (event, worker) => {
    event.stopPropagation()
    await workersApi.updateWorker(worker.id, {
      flagged: false,
      isFlagged: false,
      isFlaged: false,
      moderationStatus: 'Resolved',
      flagStatus: 'Resolved',
      resolvedAt: new Date().toISOString(),
    })
    loadWorkers()
  }

  const openReviews = (event, worker) => {
    event.stopPropagation()
    navigate(`/reviews?workerId=${encodeURIComponent(worker.id)}&worker=${encodeURIComponent(worker.name || '')}`)
  }

  const exportWorkers = () => {
    const rows = [
      ['S.No', 'Serviceman', 'Profession', 'Phone', 'Location', 'Main Area', 'Rating', 'Device Type', 'Joined Date', 'Paid', 'Amount Paid', 'Approved By'],
      ...filtered.map((worker, index) => {
        const payment = getPaymentInfo(worker)
        return [
          index + 1,
          worker.name || 'N/A',
          getProfessionLabel(worker),
          worker.phone || 'N/A',
          getLocationLabel(worker) || 'N/A',
          getMainArea(worker),
          getRating(worker),
          getDeviceType(worker),
          formatDateOnly(getWorkerJoinedDateValue(worker)),
          payment.paid,
          payment.amount,
          isApproved(worker) ? firstText(worker.approvedBy, worker.approvedByName, worker.approverName) || 'N/A' : 'N/A',
        ]
      }),
    ]

    downloadCsv(`Servicemen_Export_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {false && <PageHeader
        title="Worker Directory"
        sub={`${workers.length} total professionals · ${pending} awaiting action`}
        action={(
          <div className="flex gap-2">
            <Btn v="outline" onClick={exportWorkers}>Export</Btn>
            <Btn v="outline" onClick={() => navigate('/workers/dashboard')}>Stats</Btn>
            <Btn v="primary" onClick={() => navigate('/workers/approval')}>Approval Queue</Btn>
          </div>
        )}
      />}
      <ListToolbar
        title="Worker Directory"
        subtitle={`${workers.length} total professionals - ${pending} awaiting action`}
        resultLabel={`${pagedWorkers.length} of ${filtered.length} workers shown`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search worker, profession, or location..."
        actions={(
          <>
            <Btn v="ghost" size="sm" onClick={resetFilters}>Reset filters</Btn>
            <Btn v="outline" onClick={exportWorkers}>Export</Btn>
            <Btn v="outline" onClick={() => navigate('/workers/dashboard')}>Stats</Btn>
            <Btn v="primary" onClick={() => navigate('/workers/approval')}>Approval Queue</Btn>
          </>
        )}
        filters={(
          <>
            <FilterField value={filters.district_id} onChange={(v) => setFilters((c) => ({ ...c, district_id: v, city_id: '', area_id: '' }))} options={districtOptions} placeholder="District" />
            <FilterField value={filters.city_id} onChange={(v) => setFilters((c) => ({ ...c, city_id: v, area_id: '' }))} options={cityOptions} placeholder="City" />
            <FilterField value={filters.area_id} onChange={(v) => setFilters((c) => ({ ...c, area_id: v }))} options={areaOptions} placeholder="Area" />
            <FilterField value={filters.profession} onChange={(v) => setFilters((c) => ({ ...c, profession: v }))} options={professionOptions} placeholder="Role" icon="star" />
            <FilterField value={filters.planType} onChange={(v) => setFilters((c) => ({ ...c, planType: v }))} options={['Free', 'Pro']} placeholder="Plan" icon="dollar" />
            <FilterField value={filters.availability} onChange={(v) => setFilters((c) => ({ ...c, availability: v }))} options={['Available', 'Busy', 'Offline']} placeholder="Status" icon="activity" />
            <FilterField value={filters.approvalStatus} onChange={(v) => setFilters((c) => ({ ...c, approvalStatus: v }))} options={APPROVAL_OPTIONS} placeholder="Approval" />
            <DateFilter value={filters.dateFrom} onChange={(v) => setFilters((c) => ({ ...c, dateFrom: v }))} placeholder="From date" />
            <DateFilter value={filters.dateTo} onChange={(v) => setFilters((c) => ({ ...c, dateTo: v }))} placeholder="To date" />
            <FilterField value={filters.period} onChange={(v) => setFilters((c) => ({ ...c, period: v }))} options={PERIOD_OPTIONS} placeholder="Total" />
            <FilterField value={filters.sortBy} onChange={(v) => setFilters((c) => ({ ...c, sortBy: v || 'date' }))} options={SORT_OPTIONS} placeholder="Sort By Date" icon="activity" />
          </>
        )}
      />

      {loading ? (
        <Card pad={22}>Loading workers...</Card>
      ) : error ? (
        <EmptyState title="Unable to load workers" description={error} action={<Btn v="outline" onClick={loadWorkers}>Retry</Btn>} />
      ) : filtered.length > 0 ? (
        <>
        <DataTable cols={COLS} className="[&_table]:min-w-[1720px]">
          {pagedWorkers.map((worker, index) => {
            const payment = getPaymentInfo(worker)
            const flagged = isFlaggedWorker(worker)
            const joinedDate = formatDateOnly(getWorkerJoinedDateValue(worker))
            const approvedBy = isApproved(worker) ? firstText(worker.approvedBy, worker.approvedByName, worker.approverName) || 'N/A' : 'N/A'
            const membershipBadge = getMembershipBadge(worker)
            return (
            <TableRow
              key={worker.id}
              flagged={flagged}
              onClick={() => navigate(`/workers/${worker.id}?returnPage=${safePage}`, { state: { returnPage: safePage } })}
            >
              <TD className="whitespace-nowrap text-xs font-bold text-[var(--text-muted)]">
                {(safePage - 1) * PAGE_SIZE + index + 1}
              </TD>
              <TD>
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <WorkerAvatar worker={worker} priority={index < 6} />
                    {flagged && (
                      <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-red-500 text-white shadow-lg" title="Flagged worker">
                        <Icon n="flag" sz={11} cl="currentColor" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text-main)]">{worker.name}</p>
                    <div className="mt-1">
                      <MembershipBadge badge={membershipBadge} />
                    </div>
                  </div>
                </div>
              </TD>
              <TD>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-[var(--text-main)]">{getProfessionLabel(worker)}</span>
                  {isMultiSkilled(worker) && <Badge label="Multi-skilled" color="#8B5CF6" size="xs" />}
                </div>
              </TD>
              <TD className="whitespace-nowrap text-xs font-semibold text-[var(--text-muted)]">{worker.phone || 'N/A'}</TD>
              <TD className="max-w-[220px] truncate text-xs font-medium text-[var(--text-muted)]">{getLocationLabel(worker) || 'N/A'}</TD>
              <TD className="max-w-[150px] truncate text-xs font-semibold text-[var(--text-main)]">{getMainArea(worker)}</TD>
              <TD className="whitespace-nowrap text-xs font-bold text-amber-500">{getRating(worker)}</TD>
              <TD className="max-w-[130px] truncate text-xs font-semibold text-[var(--text-muted)]">{getDeviceType(worker)}</TD>
              <TD className="whitespace-nowrap text-xs font-semibold text-[var(--text-muted)]">{joinedDate}</TD>
              <TD>
                <div className="space-y-1 whitespace-nowrap text-xs font-bold text-[var(--text-main)]">
                  <p>Paid: <span className="font-extrabold">{payment.paid}</span></p>
                  <p>Amount: <span className="font-extrabold">{payment.amount}</span></p>
                </div>
              </TD>
              <TD className="max-w-[150px] truncate text-xs font-semibold text-[var(--text-muted)]">{approvedBy}</TD>
              <TD>
                <WorkerActionMenu
                  worker={worker}
                  flagged={flagged}
                  onReviews={openReviews}
                  onReject={rejectWorker}
                  onFlag={flagWorker}
                  onUnflag={unflagWorker}
                  onDelete={deleteWorker}
                />
              </TD>
            </TableRow>
            )
          })}
        </DataTable>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-xs font-bold text-[var(--text-muted)]">
            Page {safePage} of {pageCount} · Showing {pagedWorkers.length} records
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
      ) : workers.length === 0 ? (
        <EmptyState title="No workers found" description="Onboard a worker to populate the worker directory." action={<Btn v="primary" onClick={() => navigate('/workers/onboarding')}>Onboard Worker</Btn>} />
      ) : (
        <EmptyState title="No workers match these filters" description="Try widening the location, role, or availability filters to restore results." action={<Btn v="outline" onClick={resetFilters}>Clear filters</Btn>} />
      )}
    </div>
  )
}
