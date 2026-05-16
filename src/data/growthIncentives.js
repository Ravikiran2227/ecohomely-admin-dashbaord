export const referralSettings = {
  referrerReward: 50,
  newUserReward: 50,
  rewardTrigger: 'First successful booking',
}

export const referralRecords = [
  {
    id: 'REF-001',
    referrer: 'K Shyam',
    referrerId: 'C001',
    referrerCode: 'ECO-KS50',
    referredUser: 'Nandini',
    referredUserId: null,
    signupDate: '2026-04-07',
    firstBookingId: 'BK-0121',
    bookingStatus: 'Completed',
    referrerReward: 50,
    newUserReward: 50,
    status: 'Rewarded',
  },
  {
    id: 'REF-002',
    referrer: 'Roshan Kumar',
    referrerId: 'C003',
    referrerCode: 'ECO-RK50',
    referredUser: 'Rahul',
    referredUserId: null,
    signupDate: '2026-04-08',
    firstBookingId: 'BK-0122',
    bookingStatus: 'Pending',
    referrerReward: 50,
    newUserReward: 50,
    status: 'Waiting for first booking',
  },
]

export const cashbackRecords = [
  {
    id: 'CB-101',
    customer: 'K Shyam',
    customerId: 'C001',
    bookingId: 'BK-0120',
    redeemedInBookingId: null,
    redeemedOn: null,
    cashbackAmount: 40,
    issuedOn: '2026-04-06',
    expiresOn: '2026-04-13',
    status: 'Available',
    source: 'Booking completion',
  },
  {
    id: 'CB-102',
    customer: 'Priya Sharma',
    customerId: 'C004',
    bookingId: 'BK-0118',
    redeemedInBookingId: 'BK-0123',
    redeemedOn: '2026-04-09',
    cashbackAmount: 25,
    issuedOn: '2026-04-03',
    expiresOn: '2026-04-10',
    status: 'Used',
    source: 'Booking completion',
  },
  {
    id: 'CB-103',
    customer: 'Roshan Kumar',
    customerId: 'C003',
    bookingId: 'BK-0119',
    redeemedInBookingId: null,
    redeemedOn: null,
    cashbackAmount: 30,
    issuedOn: '2026-03-24',
    expiresOn: '2026-03-31',
    status: 'Expired',
    source: 'Booking completion',
  },
]

export const couponRecords = [
  {
    id: 'CPN-201',
    code: 'ECO50',
    type: 'Flat',
    value: 50,
    expiryDate: '2026-04-30',
    usageLimit: 100,
    usedCount: 28,
    status: 'Active',
    target: 'All users',
  },
  {
    id: 'CPN-202',
    code: 'WELCOME20',
    type: 'Percent',
    value: 20,
    expiryDate: '2026-05-15',
    usageLimit: 200,
    usedCount: 113,
    status: 'Active',
    target: 'New users',
  },
  {
    id: 'CPN-203',
    code: 'SUMMER100',
    type: 'Flat',
    value: 100,
    expiryDate: '2026-03-31',
    usageLimit: 50,
    usedCount: 50,
    status: 'Expired',
    target: 'Repeat bookings',
  },
]

export const couponRedemptionRecords = [
  {
    id: 'CR-301',
    couponId: 'CPN-201',
    bookingId: 'BK-0121',
    customerId: 'C002',
    customer: 'M. P Naidu',
    discountAmount: 50,
    redeemedOn: '2026-04-07',
    status: 'Applied',
  },
  {
    id: 'CR-302',
    couponId: 'CPN-202',
    bookingId: 'BK-0123',
    customerId: 'C004',
    customer: 'Priya Sharma',
    discountAmount: 84,
    redeemedOn: '2026-04-09',
    status: 'Applied',
  },
  {
    id: 'CR-303',
    couponId: 'CPN-203',
    bookingId: 'BK-0119',
    customerId: 'C003',
    customer: 'Roshan Kumar',
    discountAmount: 100,
    redeemedOn: '2026-03-24',
    status: 'Applied',
  },
]

export function getReferralMetrics() {
  return {
    totalReferrals: referralRecords.length,
    rewardedReferrals: referralRecords.filter((item) => item.status === 'Rewarded').length,
    waitingReferrals: referralRecords.filter((item) => item.status !== 'Rewarded').length,
    totalRewards: referralRecords
      .filter((item) => item.status === 'Rewarded')
      .reduce((sum, item) => sum + item.referrerReward + item.newUserReward, 0),
  }
}

export function getCashbackMetrics() {
  return {
    availableCashback: cashbackRecords.filter((item) => item.status === 'Available').reduce((sum, item) => sum + item.cashbackAmount, 0),
    usedCashback: cashbackRecords.filter((item) => item.status === 'Used').reduce((sum, item) => sum + item.cashbackAmount, 0),
    expiredCashback: cashbackRecords.filter((item) => item.status === 'Expired').reduce((sum, item) => sum + item.cashbackAmount, 0),
    totalEntries: cashbackRecords.length,
  }
}

export function getCouponMetrics() {
  return {
    totalCoupons: couponRecords.length,
    activeCoupons: couponRecords.filter((item) => item.status === 'Active').length,
    expiredCoupons: couponRecords.filter((item) => item.status === 'Expired').length,
    totalUses: couponRecords.reduce((sum, item) => sum + item.usedCount, 0),
  }
}
