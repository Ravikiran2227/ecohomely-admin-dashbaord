import notificationsApi from './notificationsApi'

export async function sendSMS({ mobile, message, senderId }) {
  return notificationsApi.sendSMS({ mobile, message, senderId })
}

export async function sendBulkSMS(recipients) {
  return notificationsApi.sendBulkSMS(recipients)
}

export async function getDeliveryReport(requestId) {
  return notificationsApi.getDeliveryReport(requestId)
}
