export function buildVerificationChecklist(worker) {
  return [
    { key: 'aadhaar_verified', label: 'Aadhaar verified', done: worker.documents?.some((doc) => doc.key === 'aadhaar' && doc.status === 'Verified') },
    { key: 'profile_complete', label: 'Profile complete', done: Boolean(worker.name && worker.phone && worker.profilePhoto) },
    { key: 'pricing_added', label: 'Pricing added', done: worker.professions?.every((profession) => Number(profession.price) > 0) },
    { key: 'services_added', label: 'Services added', done: worker.professions?.every((profession) => profession.services?.length > 0) },
    { key: 'location_valid', label: 'Location valid', done: Boolean(worker.state_id && worker.district_id && worker.city_id && worker.mandal_id && worker.area_id) },
  ]
}

export function canApproveWorker(worker) {
  return buildVerificationChecklist(worker).every((item) => item.done)
}

export function appendVerificationVersion(worker, review) {
  const currentVersions = worker.verificationVersions || []
  return [
    ...currentVersions,
    {
      version: currentVersions.length + 1,
      status: review.status,
      updatedAt: new Date().toISOString(),
      note: review.note || '',
      reviewer_id: review.reviewer_id,
    },
  ]
}

export function buildReviewUpdate(worker, review) {
  const nextStatus = review.action === 'approve'
    ? 'Approved'
    : review.action === 'correction'
      ? 'Correction Required'
      : 'Rejected'

  return {
    ...worker,
    approvalStatus: nextStatus,
    approvedBy: review.reviewer_name || worker.approvedBy || null,
    rejectionReason: review.reason || null,
    correctionItems: review.items || [],
    verificationVersions: appendVerificationVersion(worker, {
      status: nextStatus,
      note: review.note || review.reason || '',
      reviewer_id: review.reviewer_id,
    }),
  }
}
