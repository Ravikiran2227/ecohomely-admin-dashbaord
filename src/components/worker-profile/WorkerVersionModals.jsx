import { useEffect, useMemo, useState } from 'react'
import Badge from '../Badge'
import Btn from '../Btn'
import Modal from '../Modal'
import VersionSelector from '../VersionSelector'
import VersionComparisonTable from '../VersionComparisonTable'
import {
  formatVersionDate,
  getVersionComparisonFields,
  normalizeWorkerProfileVersions,
  resolveWorkerApprovedBy,
} from '../../utils/workerProfileVersions'
import { C } from '../../theme'

export function WorkerApprovalHistoryModal({ isOpen, worker, onClose }) {
  const versions = useMemo(
    () => (worker ? normalizeWorkerProfileVersions(worker) : []),
    [worker],
  )

  const rows = useMemo(() => (
    [...versions].sort((left, right) => Number(right.version) - Number(left.version))
  ), [versions])

  if (!worker) return null

  return (
    <Modal
      isOpen={isOpen}
      title={`Approval History · ${worker.name || 'Serviceman'}`}
      onClose={onClose}
      size="lg"
      footer={<Btn v="outline" onClick={onClose}>Close</Btn>}
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          Version-wise approval trail for this serviceman. Each row shows who handled that version when available.
        </p>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 px-4 py-8 text-center text-sm font-semibold text-[var(--text-muted)]">
            No version history found for this serviceman yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((version) => {
              const status = String(version.status || 'Pending')
              const statusColor = status.toLowerCase() === 'approved'
                ? C.success
                : status.toLowerCase().includes('reject')
                  ? C.danger
                  : C.warning
              const isApprovedStatus = status.toLowerCase().includes('approve')
              const approver = version.approvedBy
                || (isApprovedStatus ? (resolveWorkerApprovedBy(worker) || 'N/A') : '—')

              return (
                <div
                  key={version.version}
                  className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/40 px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-[var(--text-main)]">Version {version.version}</p>
                        <Badge label={status} color={statusColor} size="xs" />
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-muted)]">
                        {formatVersionDate(version.updatedAt)}
                      </p>
                      {version.notes ? (
                        <p className="text-xs text-[var(--text-muted)]">{version.notes}</p>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-right">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Approved By</p>
                      <p className="mt-1 text-sm font-extrabold text-[var(--text-main)]">{approver}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

export function WorkerVersionCompareModal({ isOpen, worker, onClose }) {
  const versions = useMemo(
    () => (worker ? normalizeWorkerProfileVersions(worker) : []),
    [worker],
  )
  const latestVersion = versions.reduce((max, item) => Math.max(max, Number(item.version) || 0), 1)
  const [selectedVersion, setSelectedVersion] = useState(latestVersion)

  useEffect(() => {
    if (!isOpen) return
    setSelectedVersion(latestVersion)
  }, [isOpen, worker?.id, latestVersion])

  const activeVersion = versions.some((item) => Number(item.version) === Number(selectedVersion))
    ? Number(selectedVersion)
    : latestVersion
  const currentVersion = versions.find((item) => Number(item.version) === activeVersion) || versions[versions.length - 1] || null
  const previousVersion = currentVersion
    ? [...versions].reverse().find((item) => Number(item.version) < Number(currentVersion.version))
    : null
  const comparisonFields = getVersionComparisonFields(previousVersion, currentVersion)

  if (!worker) return null

  return (
    <Modal
      isOpen={isOpen}
      title={`Version Compare · ${worker.name || 'Serviceman'}`}
      onClose={onClose}
      size="xl"
      footer={<Btn v="outline" onClick={onClose}>Close</Btn>}
    >
      <div className="space-y-5">
        <VersionSelector
          versions={versions}
          selectedVersion={activeVersion}
          onVersionChange={setSelectedVersion}
        />

        {previousVersion ? (
          <p className="text-sm font-semibold text-[var(--text-muted)]">
            Comparing Version {activeVersion} with previous Version {previousVersion.version}
          </p>
        ) : (
          <p className="text-sm font-semibold text-[var(--text-muted)]">
            Version {activeVersion} is the earliest available snapshot.
          </p>
        )}

        {currentVersion && comparisonFields.length > 0 ? (
          <VersionComparisonTable
            fields={comparisonFields}
            previousVersion={previousVersion}
            currentVersion={currentVersion}
            selectedVersion={activeVersion}
          />
        ) : (
          <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 px-4 py-8 text-center text-sm font-semibold text-[var(--text-muted)]">
            No comparable field data found for this version.
          </div>
        )}
      </div>
    </Modal>
  )
}
