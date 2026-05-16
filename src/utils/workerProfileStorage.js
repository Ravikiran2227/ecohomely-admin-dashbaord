const STORAGE_KEY = 'eco-worker-profile-ui'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readStorage() {
  if (!canUseStorage()) return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStorage(value) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Ignore storage quota and serialization failures for local UI preferences.
  }
}

export function getWorkerUiState(workerId) {
  if (!workerId) return {}
  const storage = readStorage()
  return storage[workerId] && typeof storage[workerId] === 'object' ? storage[workerId] : {}
}

export function patchWorkerUiState(workerId, patch) {
  if (!workerId || !patch || typeof patch !== 'object') return {}

  const storage = readStorage()
  const nextWorkerState = {
    ...(storage[workerId] || {}),
    ...patch,
  }

  storage[workerId] = nextWorkerState
  writeStorage(storage)
  return nextWorkerState
}

export function getProfessionUiState(workerId, type) {
  if (!workerId || !type) return {}

  const workerState = getWorkerUiState(workerId)
  const professions = workerState.professions && typeof workerState.professions === 'object'
    ? workerState.professions
    : {}

  return professions[type] && typeof professions[type] === 'object' ? professions[type] : {}
}

export function patchProfessionUiState(workerId, type, patch) {
  if (!workerId || !type || !patch || typeof patch !== 'object') return {}

  const workerState = getWorkerUiState(workerId)
  const professions = workerState.professions && typeof workerState.professions === 'object'
    ? workerState.professions
    : {}

  const nextProfessionState = {
    ...(professions[type] || {}),
    ...patch,
  }

  patchWorkerUiState(workerId, {
    professions: {
      ...professions,
      [type]: nextProfessionState,
    },
  })

  return nextProfessionState
}

export function getWorkerProfileData() {
  return {}
}

export function patchWorkerProfileData(_workerId, patch) {
  return patch && typeof patch === 'object' ? patch : {}
}

export function getWorkerProfessionData(workerId, type) {
  if (!workerId || !type) return {}

  const profileData = getWorkerProfileData(workerId)
  const professions = profileData.professions && typeof profileData.professions === 'object'
    ? profileData.professions
    : {}

  return professions[type] && typeof professions[type] === 'object' ? professions[type] : {}
}

export function patchWorkerProfessionData(_workerId, _type, patch) {
  return patch && typeof patch === 'object' ? patch : {}
}
