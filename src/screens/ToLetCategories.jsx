import { useMemo, useState } from 'react'
import { Card } from '../components/Card'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import ListToolbar from '../components/ListToolbar'

export default function ToLetCategories({ categories, listingUsage = {}, onAdd, onToggle, onRemove }) {
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')

  const normalizedDraft = draft.trim()
  const duplicateExists = categories.some((category) => category.name.toLowerCase() === normalizedDraft.toLowerCase())
  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase()
    return categories.filter((category) => !query || category.name.toLowerCase().includes(query))
  }, [categories, search])

  const enabledCount = categories.filter((category) => category.enabled).length
  const usedCount = categories.filter((category) => (listingUsage[category.name] || 0) > 0).length

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Categories', value: categories.length, sub: 'Available property types' },
          { label: 'Enabled', value: enabledCount, sub: 'Visible in filters and forms' },
          { label: 'Disabled', value: categories.length - enabledCount, sub: 'Hidden from new submissions' },
          { label: 'In Use', value: usedCount, sub: 'Currently attached to listings' },
        ].map((item) => (
          <Card key={item.label} className="p-4.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.label}</div>
            <div className="mt-2 text-2xl font-black text-[var(--text-main)]">{item.value}</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">{item.sub}</div>
          </Card>
        ))}
      </div>

      <ListToolbar
        title="Category Control"
        subtitle="Add new property types, search the current catalog, and avoid removing categories that still power live listings"
        resultLabel={`${filteredCategories.length} ${filteredCategories.length === 1 ? 'category' : 'categories'} in view`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search property type"
        actions={(
          <div className="flex w-full flex-wrap items-end gap-3 xl:w-auto">
            <div className="min-w-[240px] flex-1 xl:flex-none">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Example: Studio or Farm House"
                className="w-full h-11 px-4 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] text-sm font-semibold text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder-[var(--text-muted)]"
              />
            </div>
            <Btn
              v="primary"
              onClick={() => {
                if (!normalizedDraft || duplicateExists) return
                onAdd(normalizedDraft)
                setDraft('')
              }}
              disabled={!normalizedDraft || duplicateExists}
              className="h-11 px-6 rounded-xl"
            >
              Add Category
            </Btn>
          </div>
        )}
        filters={(
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {duplicateExists && normalizedDraft ? 'A category with this name already exists.' : 'Disabling hides a type from new forms, but does not change existing listings.'}
          </div>
        )}
      />

      <Card className="p-5">
        {filteredCategories.length > 0 ? (
          <div className="grid gap-3.5">
            {filteredCategories.map((category) => {
              const usageCount = listingUsage[category.name] || 0
              const isInUse = usageCount > 0

              return (
                <div
                  key={category.name}
                  className="flex flex-col gap-4 rounded-2xl border border-[var(--border-main)] p-4 transition-all hover:bg-[var(--bg-main)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1.5">
                    <p className="text-base font-extrabold text-[var(--text-main)]">{category.name}</p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge label={category.enabled ? 'Enabled' : 'Disabled'} color={category.enabled ? '#16A34A' : '#64748B'} size="xs" dot={category.enabled} />
                      <Badge label={`${usageCount} listing${usageCount === 1 ? '' : 's'}`} color={isInUse ? '#2563EB' : '#64748B'} size="xs" dot={isInUse} />
                    </div>
                    <p className="text-xs font-medium text-[var(--text-muted)]">
                      {isInUse
                        ? 'Used by active listing records. Remove only after those listings are retyped.'
                        : category.enabled
                          ? 'Visible in listing forms and filters.'
                          : 'Hidden from selection for new submissions.'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Btn size="xs" v="outline" onClick={() => onToggle(category.name)} className="h-8 px-3 text-[10px] uppercase font-black">
                      {category.enabled ? 'Disable' : 'Enable'}
                    </Btn>
                    <Btn size="xs" v="danger" onClick={() => onRemove(category.name)} disabled={isInUse} className="h-8 px-3 text-[10px] uppercase font-black">
                      Remove
                    </Btn>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState title="No categories match this search" description="Try a different keyword to manage property types in the ToLet catalog." className="py-10" />
        )}
      </Card>
    </div>
  )
}
