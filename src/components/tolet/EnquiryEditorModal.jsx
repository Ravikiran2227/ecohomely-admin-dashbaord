import Btn from '../Btn'
import Modal from '../Modal'

const INPUT_CLASS = 'h-11 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 text-sm font-medium text-[var(--text-main)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
const LABEL_CLASS = 'grid gap-2 text-sm font-semibold text-[var(--text-main)]'

export default function EnquiryEditorModal({ editor, listings, onChange, onClose, onSave }) {
  const { form, isOpen, mode } = editor
  const isSubmitDisabled = !form.listingId || !form.customerName.trim() || !form.phone.trim()

  return (
    <Modal
      isOpen={isOpen}
      title={mode === 'edit' ? 'Edit Enquiry' : 'Create Enquiry'}
      onClose={onClose}
      size="lg"
      footer={(
        <>
          <Btn v="outline" onClick={onClose}>Cancel</Btn>
          <Btn v="primary" onClick={onSave} disabled={isSubmitDisabled}>
            {mode === 'edit' ? 'Save Enquiry' : 'Create Enquiry'}
          </Btn>
        </>
      )}
    >
      <div className="grid gap-5">
        <section>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Enquiry Details</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS}>
              Listing
              <select value={form.listingId} onChange={(event) => onChange('listingId', event.target.value)} className={INPUT_CLASS}>
                {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.id} · {listing.title}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Status
              <select value={form.status} onChange={(event) => onChange('status', event.target.value)} className={INPUT_CLASS}>
                {['New', 'Contacted', 'Closed'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Customer Name
              <input value={form.customerName} onChange={(event) => onChange('customerName', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Phone
              <input value={form.phone} onChange={(event) => onChange('phone', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Date
              <input type="date" value={form.date} onChange={(event) => onChange('date', event.target.value)} className={INPUT_CLASS} />
            </label>
          </div>
        </section>
      </div>
    </Modal>
  )
}