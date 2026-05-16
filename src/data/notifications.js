export const smsLog = [
  { id:1, title:'New Feature: ToLet Listings', body:'List your property on Ecohomely!', audience:'All Customers', sent:'2026-04-05 10:30', delivered:412, opened:187, channel:'push' },
  { id:2, title:'Subscription Renewal', body:'Your plan expires in 3 days. Renew now.', audience:'Expiring Workers', sent:'2026-04-04 09:00', delivered:5, opened:3, channel:'sms' },
  { id:3, title:'Holi Special Deals', body:'Special discounts on cleaning services!', audience:'All Users', sent:'2026-03-13 08:00', delivered:842, opened:310, channel:'whatsapp' },
  { id:4, title:'Verify Your Aadhaar', body:'Complete verification to get Verified badge.', audience:'Unverified Workers', sent:'2026-04-01 11:00', delivered:89, opened:44, channel:'push' },
]

export const audienceRecipientMap = {
  all: [
    { type: 'customer', entityId: 'C001', name: 'K Shyam' },
    { type: 'customer', entityId: 'C003', name: 'Roshan Kumar' },
    { type: 'worker', entityId: 'W001', name: 'Laxman Rao' },
    { type: 'worker', entityId: 'W009', name: 'MACHETTI VENKATESH' },
  ],
  customers: [
    { type: 'customer', entityId: 'C001', name: 'K Shyam' },
    { type: 'customer', entityId: 'C004', name: 'Priya Sharma' },
    { type: 'customer', entityId: 'C006', name: 'GOMPA VEERABABU' },
  ],
  workers: [
    { type: 'worker', entityId: 'W001', name: 'Laxman Rao' },
    { type: 'worker', entityId: 'W009', name: 'MACHETTI VENKATESH' },
    { type: 'worker', entityId: 'W016', name: 'AC Doctor' },
  ],
  paid: [
    { type: 'worker', entityId: 'W009', name: 'MACHETTI VENKATESH' },
    { type: 'worker', entityId: 'W010', name: 'Sujith' },
    { type: 'worker', entityId: 'W014', name: 'GR Enterprises' },
  ],
  unpaid: [
    { type: 'worker', entityId: 'W003', name: 'Ramu Babu' },
    { type: 'worker', entityId: 'W004', name: 'Kolli Shankar' },
    { type: 'worker', entityId: 'W008', name: 'Pavan Kalyan' },
  ],
  expiring: [
    { type: 'worker', entityId: 'W005', name: 'Ramoju Srinivas' },
    { type: 'worker', entityId: 'W006', name: 'Suresh Kumar' },
  ],
  unverified: [
    { type: 'worker', entityId: 'W003', name: 'Ramu Babu' },
    { type: 'worker', entityId: 'W007', name: 'Venkateswara Rao' },
    { type: 'worker', entityId: 'W008', name: 'Pavan Kalyan' },
  ],
  area: [],
}

export const campaignRecipients = [
  { campaignId: 1, type: 'customer', entityId: 'C001', name: 'K Shyam', status: 'Delivered' },
  { campaignId: 1, type: 'customer', entityId: 'C003', name: 'Roshan Kumar', status: 'Opened' },
  { campaignId: 1, type: 'customer', entityId: 'C004', name: 'Priya Sharma', status: 'Delivered' },
  { campaignId: 2, type: 'worker', entityId: 'W005', name: 'Ramoju Srinivas', status: 'Opened' },
  { campaignId: 2, type: 'worker', entityId: 'W006', name: 'Suresh Kumar', status: 'Delivered' },
  { campaignId: 2, type: 'worker', entityId: 'W001', name: 'Laxman Rao', status: 'Delivered' },
  { campaignId: 3, type: 'customer', entityId: 'C002', name: 'M. P Naidu', status: 'Delivered' },
  { campaignId: 3, type: 'customer', entityId: 'C003', name: 'Roshan Kumar', status: 'Opened' },
  { campaignId: 3, type: 'worker', entityId: 'W010', name: 'Sujith', status: 'Delivered' },
  { campaignId: 4, type: 'worker', entityId: 'W003', name: 'Ramu Babu', status: 'Opened' },
  { campaignId: 4, type: 'worker', entityId: 'W007', name: 'Venkateswara Rao', status: 'Delivered' },
  { campaignId: 4, type: 'worker', entityId: 'W008', name: 'Pavan Kalyan', status: 'Delivered' },
]

export const statusVariant = {
  sent:    { label:'Sent',    color:'#16a34a' },
  failed:  { label:'Failed',  color:'#dc2626' },
  pending: { label:'Pending', color:'#d97706' },
}

export const audienceOptions = [
  { id:'all',        label:'All Users',           count: 859 },
  { id:'customers',  label:'All Customers',        count: 675 },
  { id:'workers',    label:'All Servicemen',       count: 184 },
  { id:'paid',       label:'Paid Subscribers',     count: 94  },
  { id:'unpaid',     label:'Unpaid Workers',       count: 90  },
  { id:'expiring',   label:'Expiring Soon',        count: 5   },
  { id:'unverified', label:'Unverified Workers',   count: 89  },
  { id:'area',       label:'By Area',              count: null },
]
