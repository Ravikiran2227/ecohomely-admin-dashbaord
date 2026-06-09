import Btn from '../Btn'
import Modal from '../Modal'

const INPUT_CLASS = 'h-11 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 text-sm font-medium text-[var(--text-main)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const TEXTAREA_CLASS = 'min-h-[120px] rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 text-sm font-medium text-[var(--text-main)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const LABEL_CLASS = 'grid gap-2 text-sm font-semibold text-[var(--text-main)]'
const TOGGLE_CLASS = 'flex items-center gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 px-4 py-3 text-sm font-semibold text-[var(--text-main)]'

export default function ListingEditorModal({ editor, categories, onChange, onClose, onSave }) {
  const { form, isOpen, mode } = editor
  const propertyTypes = [...new Set([...categories.map((item) => item.name), form.propertyType].filter(Boolean))]
  const isSubmitDisabled = mode !== 'edit' && (!form.title.trim() || !form.ownerName.trim() || !form.ownerPhone.trim() || !form.area.trim())

  return (
    <Modal
      isOpen={isOpen}
      title={mode === 'edit' ? 'Edit Listing' : 'Create Listing'}
      onClose={onClose}
      size="xl"
      footer={(
        <>
          <Btn v="outline" onClick={onClose}>Cancel</Btn>
          <Btn v="primary" onClick={onSave} disabled={isSubmitDisabled}>
            {mode === 'edit' ? 'Save Updated' : 'Create Listing'}
          </Btn>
        </>
      )}
    >
      <div className="grid gap-5">
        <section>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Basic Details</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS}>
              Listing Title
              <input value={form.title} onChange={(event) => onChange('title', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Property Type
              <select value={form.propertyType} onChange={(event) => onChange('propertyType', event.target.value)} className={INPUT_CLASS}>
                {propertyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Owner Name
              <input value={form.ownerName} onChange={(event) => onChange('ownerName', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Owner Phone
              <input value={form.ownerPhone} onChange={(event) => onChange('ownerPhone', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Area
              <input value={form.area} onChange={(event) => onChange('area', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Posted At
              <input type="date" value={form.postedAt} onChange={(event) => onChange('postedAt', event.target.value)} className={INPUT_CLASS} />
            </label>
          </div>
        </section>

        <section>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pricing And Status</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS}>
              Rent
              <input type="number" value={form.rent} onChange={(event) => onChange('rent', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Deposit
              <input type="number" value={form.deposit} onChange={(event) => onChange('deposit', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Maintenance
              <input type="number" value={form.maintenance} onChange={(event) => onChange('maintenance', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Approval Status
              <select value={form.approvalStatus} onChange={(event) => onChange('approvalStatus', event.target.value)} className={INPUT_CLASS}>
                {['Pending', 'Approved', 'Rejected'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Approved At
              <input type="date" value={form.approvedAt} onChange={(event) => onChange('approvedAt', event.target.value)} className={INPUT_CLASS} />
            </label>
          </div>
        </section>

        <section>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Property Setup</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS}>
              Furnishing
              <select value={form.furnishing} onChange={(event) => onChange('furnishing', event.target.value)} className={INPUT_CLASS}>
                {['Unfurnished', 'Semi Furnished', 'Fully Furnished'].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Tenant Preference
              <select value={form.tenantPreference} onChange={(event) => onChange('tenantPreference', event.target.value)} className={INPUT_CLASS}>
                {['Family', 'Bachelors', 'Anyone'].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Bedrooms
              <input type="number" value={form.bedrooms} onChange={(event) => onChange('bedrooms', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Bathrooms
              <input type="number" value={form.bathrooms} onChange={(event) => onChange('bathrooms', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Size Sq Ft
              <input type="number" value={form.sizeSqft} onChange={(event) => onChange('sizeSqft', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Parking
              <input value={form.parking} onChange={(event) => onChange('parking', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Location Accuracy
              <select value={form.locationAccuracy} onChange={(event) => onChange('locationAccuracy', event.target.value)} className={INPUT_CLASS}>
                {['Approx', 'Verified'].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Latitude
              <input value={form.latitude} onChange={(event) => onChange('latitude', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Longitude
              <input value={form.longitude} onChange={(event) => onChange('longitude', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={TOGGLE_CLASS}>
              <input type="checkbox" checked={form.petsAllowed} onChange={(event) => onChange('petsAllowed', event.target.checked)} className="h-4 w-4 accent-brand-500" />
              Pets Allowed
            </label>
            <label className={TOGGLE_CLASS}>
              <input type="checkbox" checked={form.directCallAllowed} onChange={(event) => onChange('directCallAllowed', event.target.checked)} className="h-4 w-4 accent-brand-500" />
              Direct Call Allowed
            </label>
          </div>
        </section>

        <section>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Location And Content</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2 grid gap-2 text-sm font-semibold text-[var(--text-main)]">
              Photos
              <input value={form.photos} onChange={(event) => onChange('photos', event.target.value)} placeholder="Front View, Hall, Kitchen" className={INPUT_CLASS} />
            </label>
            <label className="md:col-span-2 grid gap-2 text-sm font-semibold text-[var(--text-main)]">
              Description
              <textarea value={form.description} onChange={(event) => onChange('description', event.target.value)} className={TEXTAREA_CLASS} />
            </label>
          </div>
        </section>
      </div>
    </Modal>
  )
}
