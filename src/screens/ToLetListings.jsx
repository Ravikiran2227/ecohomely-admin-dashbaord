import { Card } from '../components/Card'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import ListToolbar from '../components/ListToolbar'
import { DataTable, TableRow, TD } from '../components/Table'

function trialLabel(listing) {
  if (listing.status === 'Pending' || listing.status === 'Rejected') return 'Not started'
  if (listing.status === 'Live' && listing.trialDaysLeft === 0) return 'Review needed'
  if (listing.status === 'Expired') return 'Expired'
  if (listing.status === 'Hold') return 'On hold'
  return `${listing.trialDaysLeft} day${listing.trialDaysLeft === 1 ? '' : 's'} left`
}

function actionButtons(listing, actions) {
  const buttons = [
    { label: 'View', onClick: () => actions.onView(listing.id), variant: 'outline', icon: 'eye', emphasis: 'utility' },
    { label: 'Edit', onClick: () => actions.onEdit(listing.id), variant: 'outline', icon: 'edit', emphasis: 'secondary' },
  ]

  if (listing.status === 'Pending') {
    buttons.push({ label: 'Approve', onClick: () => actions.onApprove(listing.id), variant: 'success', icon: 'check', emphasis: 'primary', disabled: !listing.registrationReady })
    buttons.push({ label: 'Reject', onClick: () => actions.onReject(listing.id), variant: 'danger', icon: 'close', emphasis: 'destructive' })
  }

  if (listing.status === 'Live' || listing.status === 'Hold' || listing.status === 'Expired') {
    buttons.push({ label: 'Extend Trial', onClick: () => actions.onExtendTrial(listing.id), variant: 'outline', icon: 'calendar', emphasis: listing.status === 'Live' ? 'primary' : 'secondary' })
  }

  if (listing.status === 'Hold' || listing.status === 'Expired') {
    buttons.push({ label: 'Activate', onClick: () => actions.onActivate(listing.id), variant: 'success', icon: 'refresh', emphasis: 'primary', disabled: !listing.registrationReady })
  }

  if (listing.status !== 'Expired' && listing.status !== 'Rejected') {
    buttons.push({ label: 'Force Expire', onClick: () => actions.onForceExpire(listing.id), variant: 'warning', icon: 'clock', emphasis: 'secondary' })
  }

  buttons.push({ label: 'Delete', onClick: () => actions.onDelete(listing.id), variant: 'danger', icon: 'trash', emphasis: 'destructive' })

  return buttons
}

function splitActions(buttons) {
  const primary = buttons.find((button) => button.emphasis === 'primary')
  const utility = buttons.find((button) => button.emphasis === 'utility')
  const secondary = buttons.filter((button) => button !== primary && button !== utility)
  return { primary, utility, secondary }
}

function actionChipClass(variant) {
  const classes = {
    outline: 'border-[var(--border-main)] bg-[var(--bg-main)]/70 text-[var(--text-main)] hover:border-brand-500/40 hover:bg-brand-500/8',
    success: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/18',
    warning: 'border-amber-500/25 bg-amber-500/12 text-amber-600 dark:text-amber-400 hover:bg-amber-500/18',
    danger: 'border-red-500/25 bg-red-500/12 text-red-600 dark:text-red-400 hover:bg-red-500/18',
  }

  return classes[variant] || classes.outline
}

function ListingActionCell({ listing, actions }) {
  const { primary, utility, secondary } = splitActions(actionButtons(listing, actions))

  return (
    <div className="min-w-[216px] max-w-[244px] space-y-2">
      <div className="flex items-center gap-2">
        {primary ? (
          <Btn
            size="xs"
            v={primary.variant}
            onClick={primary.onClick}
            disabled={primary.disabled}
            className="h-8 flex-1 justify-center rounded-lg px-3 text-[11px] font-extrabold tracking-wide shadow-none"
          >
            <Icon n={primary.icon} sz={12} />
            {primary.label}
          </Btn>
        ) : (
          <div className="flex-1 h-8 rounded-lg border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/55" />
        )}
        {utility && (
          <button
            type="button"
            onClick={utility.onClick}
            className="h-8 min-w-[72px] px-3 rounded-lg border border-[var(--border-main)] bg-[var(--bg-main)]/72 text-[11px] font-bold text-[var(--text-main)] inline-flex items-center justify-center gap-1.5 hover:border-brand-500/45 hover:bg-brand-500/8 transition-colors"
          >
            <Icon n={utility.icon} sz={12} />
            {utility.label}
          </button>
        )}
      </div>

      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {secondary.map((button) => (
            <button
              key={button.label}
              type="button"
              onClick={button.onClick}
              disabled={button.disabled}
              className={`h-7 px-2.5 rounded-full border text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${actionChipClass(button.variant)}`}
            >
              <Icon n={button.icon} sz={10} />
              {button.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ToLetListings({ listings, actions, statusColor, filters, onFiltersChange, propertyTypes = [], onCreate }) {
  const flaggedCount = listings.filter((listing) => listing.missingFields.length > 0 || listing.isDuplicate || listing.registrationIssues.length > 0).length
  const liveCount = listings.filter((listing) => listing.status === 'Live').length
  const hasActiveFilters = filters.search || filters.status !== 'All' || filters.propertyType !== 'All'

  return (
    <div className="grid gap-4.5">
      <ListToolbar
        title="Listing Operations"
        subtitle="Filter the approval pipeline, surface quality issues quickly, and jump into listing actions without leaving the table"
        resultLabel={`${listings.length} listing${listings.length === 1 ? '' : 's'} in view`}
        searchValue={filters.search}
        onSearchChange={(value) => onFiltersChange((current) => ({ ...current, search: value }))}
        searchPlaceholder="Search listing ID, title, owner, area..."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {typeof onCreate === 'function' && (
              <Btn
                size="xs"
                v="primary"
                onClick={onCreate}
                className="h-8 px-3 text-[10px] uppercase font-black"
              >
                New Listing
              </Btn>
            )}
            <Badge label={`${liveCount} live`} color="#16A34A" size="xs" dot={liveCount > 0} />
            <Badge label={`${flaggedCount} flagged`} color={flaggedCount > 0 ? '#DC2626' : '#64748B'} size="xs" dot={flaggedCount > 0} />
            {hasActiveFilters && (
              <Btn
                size="xs"
                v="outline"
                onClick={() => onFiltersChange({ search: '', status: 'All', propertyType: 'All' })}
                className="h-8 px-3 text-[10px] uppercase font-black"
              >
                Reset Filters
              </Btn>
            )}
          </div>
        )}
        filters={(
          <>
            <div className="relative min-w-[200px] flex-1 lg:flex-none">
              <select
                value={filters.status}
                onChange={(event) => onFiltersChange((current) => ({ ...current, status: event.target.value }))}
                className="w-full h-11 px-4 pr-10 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] text-sm font-semibold text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all appearance-none cursor-pointer"
              >
                {['All Status', 'Pending', 'Live', 'Hold', 'Expired', 'Rejected'].map((status) => (
                  <option key={status} value={status === 'All Status' ? 'All' : status}>{status}</option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
                <Icon n="chevron-down" sz={12} />
              </div>
            </div>
            <div className="relative min-w-[220px] flex-1 lg:flex-none">
              <select
                value={filters.propertyType}
                onChange={(event) => onFiltersChange((current) => ({ ...current, propertyType: event.target.value }))}
                className="w-full h-11 px-4 pr-10 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] text-sm font-semibold text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all appearance-none cursor-pointer"
              >
                {['All Types', ...propertyTypes].map((type) => (
                  <option key={type} value={type === 'All Types' ? 'All' : type}>{type}</option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
                <Icon n="chevron-down" sz={12} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-[var(--text-muted)]">
              <Icon n="info" sz={12} />
              Quality flags, duplicates, and registration blockers are highlighted directly in the table.
            </div>
          </>
        )}
      />

      {listings.length > 0 ? (
        <Card className="overflow-hidden p-0 border-none shadow-premium">
          <DataTable
            cols={[
              { label: 'Listing ID', w: 110 },
              { label: 'Title' },
              { label: 'Owner' },
              { label: 'Registration' },
              { label: 'Phone' },
              { label: 'Area' },
              { label: 'Type' },
              { label: 'Rent' },
              { label: 'Status' },
              { label: 'Trial Status' },
              { label: 'Posted' },
              { label: 'Actions', w: 250 },
            ]}
          >
            {listings.map((listing) => (
              <TableRow key={listing.id} highlight={listing.missingFields.length > 0 || listing.isDuplicate || listing.registrationIssues.length > 0} onClick={() => actions.onView(listing.id)}>
                <TD className="font-bold text-brand-600">{listing.id}</TD>
                <TD>
                  <div className="grid gap-1 min-w-[160px]">
                    <div className="font-bold text-[var(--text-main)] truncate">{listing.title}</div>
                    {listing.isDuplicate && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-tight">
                        <Icon n="alert" sz={10} /> Duplicate detected
                      </div>
                    )}
                  </div>
                </TD>
                <TD className="font-medium">{listing.ownerName}</TD>
                <TD>
                  <div className="grid gap-1.5">
                    <Badge label={listing.registrationReady ? 'Ready' : 'Blocked'} color={listing.registrationReady ? '#16A34A' : '#DC2626'} size="xs" dot={listing.registrationReady} />
                    {listing.registrationIssues[0] ? <span className="text-[10px] font-bold text-red-600 dark:text-red-400">{listing.registrationIssues[0]}</span> : null}
                  </div>
                </TD>
                <TD className="font-mono text-xs text-[var(--text-muted)]">{listing.ownerPhone}</TD>
                <TD className="text-xs font-medium truncate max-w-[120px]">{listing.area}</TD>
                <TD>
                  <Badge label={listing.propertyType} v="outline" size="xs" />
                </TD>
                <TD className="font-bold text-emerald-600 dark:text-emerald-400">₹{listing.rent.toLocaleString('en-IN')}</TD>
                <TD>
                  <div className="grid gap-1.5">
                    <Badge label={listing.status} color={statusColor(listing.status)} size="xs" dot={listing.status === 'Live'} />
                    {listing.approvalStatus === 'Approved' && listing.status !== 'Rejected' && (
                      <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Approved</span>
                    )}
                  </div>
                </TD>
                <TD>
                  <div className="grid gap-1">
                    <span className="text-xs font-bold text-[var(--text-main)]">{trialLabel(listing)}</span>
                    {listing.notificationFlags.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter text-amber-600 dark:text-amber-400">
                        <Icon n="alert" sz={10} /> {listing.notificationFlags[0].label}
                      </span>
                    )}
                  </div>
                </TD>
                <TD className="whitespace-nowrap text-xs text-[var(--text-muted)]">{listing.postedAt}</TD>
                <TD onClick={(event) => event.stopPropagation()}>
                  <ListingActionCell listing={listing} actions={actions} />
                </TD>
              </TableRow>
            ))}
          </DataTable>
        </Card>
      ) : (
        <EmptyState
          title="No listings match these filters"
          description="Reset the search or filters to bring the ToLet approval queue back into view."
          action={hasActiveFilters ? <Btn v="outline" onClick={() => onFiltersChange({ search: '', status: 'All', propertyType: 'All' })}>Reset Filters</Btn> : null}
        />
      )}
    </div>
  )
}
