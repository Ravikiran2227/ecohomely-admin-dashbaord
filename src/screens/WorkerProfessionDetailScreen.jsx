import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ActionToast from '../components/worker-profile/ActionToast'
import PageHeader from '../components/PageHeader'
import Btn from '../components/Btn'
import ProfessionEditorModal from '../components/worker-profile/ProfessionEditorModal'
import { ProfessionWorkspace } from '../components/worker-profile/ProfessionWorkspace'
import {
  getPrimaryProfession,
  getSecondaryProfession,
} from '../data/workerSystem'
import workersApi from '../services/workersApi'
import { buildWorkerMediaDeletePayload } from '../utils/workerMedia'

export default function WorkerProfessionDetailScreen() {
  const { id, type } = useParams()
  const navigate = useNavigate()
  const [worker, setWorker] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [notice, setNotice] = useState(null)

  const resolvedType = type === 'secondary' ? 'secondary' : 'primary'
  const profession = worker ? (resolvedType === 'secondary' ? getSecondaryProfession(worker) : getPrimaryProfession(worker)) : null

  const loadWorker = async () => {
    setLoading(true)
    setError('')
    try {
      setWorker(await workersApi.getWorker(id))
    } catch (err) {
      setError(err.message || 'Unable to load worker profession.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorker()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!notice?.message) return undefined

    const timeoutId = window.setTimeout(() => setNotice(null), 2400)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  const handleSaveProfession = async (payload) => {
    const updated = await workersApi.updateProfession(worker.id, resolvedType, payload)
    setWorker(updated)
    setNotice({
      tone: 'success',
      title: 'Profession saved',
      message: `${resolvedType === 'secondary' ? 'Secondary' : 'Primary'} profession details were updated successfully.`,
    })
    setIsEditing(false)
  }

  const handleDeleteProfessionMedia = async (item) => {
    const updated = await workersApi.updateWorker(worker.id, buildWorkerMediaDeletePayload(worker, resolvedType, item))
    setWorker(updated)
    setNotice({
      tone: 'info',
      title: 'Media deleted',
      message: 'The selected profession media was removed from this worker profile.',
    })
  }

  if (loading) {
    return <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-6 py-10">Loading profession...</div>
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-6 py-10">
        <div className="grid gap-3">
          <div className="text-sm font-bold text-[var(--text-main)]">Unable to load profession</div>
          <div className="text-sm text-[var(--text-muted)]">{error}</div>
          <Btn v="outline" onClick={loadWorker}>Retry</Btn>
        </div>
      </div>
    )
  }

  if (!profession) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)]">
        <PageHeader
          title="Profession Detail"
          sub="This worker does not have profession data for the selected tab yet"
          action={<Btn v="outline" onClick={() => navigate(`/workers/${worker.id}`)}>Back to Worker Profile</Btn>}
        />
        <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--card-bg)] px-6 py-16 text-center">
          <div className="text-lg font-bold text-[var(--text-main)]">Add your profession details to get started</div>
          <div className="mt-2 text-sm text-[var(--text-muted)]">No profession record is available for this view.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)]">
      <PageHeader
        title={`${profession.profession} Detail`}
        sub="Dedicated profession workspace with plan access, job description, pricing packages, gallery, and mobile-friendly CTA actions"
        action={<Btn v="outline" onClick={() => navigate(`/workers/${worker.id}`)}>Back to Worker Profile</Btn>}
      />

      <ProfessionWorkspace
        key={`${worker.id}-${resolvedType}`}
        worker={worker}
        profession={profession}
        type={resolvedType}
        mode="page"
        onBack={() => navigate(`/workers/${worker.id}`)}
        onEdit={() => setIsEditing(true)}
        onChat={() => window.open(`https://wa.me/91${worker.phone}`, '_blank', 'noopener,noreferrer')}
        onBook={() => navigate('/bookings')}
        onNotify={setNotice}
        onDeleteMedia={handleDeleteProfessionMedia}
      />

      <ProfessionEditorModal
        key={`${worker.id}-${resolvedType}-${isEditing ? 'open' : 'closed'}`}
        isOpen={isEditing}
        type={resolvedType}
        profession={profession}
        onClose={() => setIsEditing(false)}
        onSave={handleSaveProfession}
      />

      <ActionToast notice={notice} />
    </div>
  )
}
