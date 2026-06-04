import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebaseClient'

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024

function extensionForFile(file) {
  const fromName = String(file?.name || '').split('.').pop()
  if (fromName && fromName !== file?.name) return fromName.toLowerCase()
  return String(file?.type || '').split('/').pop() || 'jpg'
}

function cleanPathPart(value) {
  return String(value || 'admin')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'admin'
}

export function validateAdminProfilePhoto(file) {
  if (!file) return 'Choose a profile photo to upload.'
  if (!String(file.type || '').startsWith('image/')) return 'Only image files can be uploaded.'
  if (file.size > MAX_PROFILE_PHOTO_BYTES) return 'Profile photo must be 5 MB or smaller.'
  return ''
}

export async function uploadAdminProfilePhoto(file, adminUser) {
  const validationError = validateAdminProfilePhoto(file)
  if (validationError) throw new Error(validationError)

  const adminId = cleanPathPart(adminUser?.id || adminUser?.uid || adminUser?.email || adminUser?.username)
  const extension = extensionForFile(file)
  const path = `admin-profile-photos/${adminId}/profile-${Date.now()}.${extension}`
  const imageRef = ref(storage, path)

  await uploadBytes(imageRef, file, {
    contentType: file.type || 'image/jpeg',
    customMetadata: {
      adminId,
      uploadedBy: adminUser?.email || adminUser?.username || adminUser?.name || 'admin',
    },
  })

  return {
    profilePhotoPath: path,
    profilePhotoUrl: await getDownloadURL(imageRef),
  }
}
