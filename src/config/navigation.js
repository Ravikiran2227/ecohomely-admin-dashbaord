export const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { path: '/dashboard', icon: 'home', label: 'Dashboard', summary: 'Track KPIs, operations, and live platform movement.' },
      { path: '/notifications', icon: 'bell', label: 'Notifications', badgeKey: 'adminNotifications', badgeColor: '#EF4444', summary: 'Review booking, profile, and account deletion alerts.' },
    ],
  },
  {
    label: 'People',
    items: [
      { path: '/workers', icon: 'worker', label: 'Servicemen', summary: 'Manage worker listings, plans, and quality signals.' },
      { path: '/workers/approval', icon: 'check', label: 'Approval Queue', badgeKey: 'approvalQueue', badgeColor: '#F59E0B', summary: 'Review worker verification and pending approvals.' },
      { path: '/profile-updates', icon: 'bell', label: 'Profile Updates', badgeKey: 'profileUpdates', badgeColor: '#14B8A6', summary: 'Review worker correction resubmissions.' },
      { path: '/customers', icon: 'users', label: 'Customers', summary: 'View customer records and issue history.' },
      { path: '/subadmins', icon: 'shield', label: 'Sub Admins', summary: 'Control delegated access and admin roles.' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/bookings', icon: 'calendar', label: 'Booking Tracker', isNew: true, summary: 'Monitor jobs, delays, and assignment flow.' },
      { path: '/assistance', icon: 'headphones', label: 'Assistance', isNew: true, summary: 'Help customers find workers quickly by location.' },
    ],
  },
  {
    label: 'Property',
    items: [
      { path: '/tolet', icon: 'building', label: 'ToLet Module', isNew: true, summary: 'Review property listings and enquiries.' },
    ],
  },
  {
    label: 'Services',
    items: [
      { path: '/reviews', icon: 'star', label: 'Reviews & Ratings', summary: 'Track quality, ratings, and review moderation.' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { path: '/plans', icon: 'creditcard', label: 'Subscription Plans', isNew: true, summary: 'Manage pricing, subscriptions, and plan tiers.' },
      { path: '/payments', icon: 'receipt', label: 'Payment History', summary: 'Audit transactions and payout records.' },
      { path: '/referrals', icon: 'referral', label: 'Referrals', summary: 'Measure referral growth and conversion quality.' },
      { path: '/cashbacks', icon: 'dollar', label: 'Cashbacks', summary: 'Track incentive spend and cashback campaigns.' },
      { path: '/coupons', icon: 'coupon', label: 'Coupon Codes', summary: 'Create and manage coupon performance.' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { path: '/announcements', icon: 'bell', label: 'New Features', isNew: true, summary: 'Create and manage Firebase app announcements.' },
      { path: '/push-notifications', icon: 'bell', label: 'Push Notifications', summary: 'Send and track customer and worker campaigns.' },
    ],
  },
  {
    label: 'Maps',
    items: [
      { path: '/heatmap', icon: 'map', label: 'GPS Heatmap', isNew: true, summary: 'Visualize demand density and coverage gaps.' },
      { path: '/expansion', icon: 'city', label: 'Expansion System', isNew: true, summary: 'Plan new areas, clusters, and operational expansion.' },
    ],
  },
  {
    label: 'Moderation',
    items: [
      { path: '/flagged', icon: 'flag', label: 'Flagged Users', badgeKey: 'flagged', badgeColor: '#EF4444', summary: 'Investigate suspicious accounts and violations.' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/logs', icon: 'activity', label: 'Activity Logs', summary: 'Inspect admin activity and trace changes.' },
      { path: '/account-deletions', icon: 'users', label: 'Account Deletion', summary: 'Review account deletion requests from Firebase.' },
      { path: '/control-versions', icon: 'settings', label: 'Control Version', summary: 'Inspect Firebase app version control records.' },
      { path: '/areas', icon: 'mappin', label: 'Area Names', summary: 'Control serviceable area definitions.' },
      { path: '/settings', icon: 'settings', label: 'Settings', summary: 'Update system preferences and platform defaults.' },
    ],
  },
]

export const ROUTE_ITEMS = NAV_SECTIONS.flatMap((section) => section.items)
export const ROUTE_LABELS = Object.fromEntries(ROUTE_ITEMS.map((item) => [item.path, item.label]))

export const BREADCRUMBS = {
  '/workers/approval': ['People', 'Approval Queue'],
  '/profile-updates': ['People', 'Profile Updates'],
  '/push-notifications': ['Marketing', 'Push Notifications'],
  '/notifications': ['Main', 'Notifications'],
  '/heatmap': ['Maps', 'GPS Heatmap'],
  '/expansion': ['Maps', 'Expansion System'],
}

export const HEADER_ALERTS = [
  { icon: 'alert', text: '7 workers pending approval', color: '#F59E0B', path: '/workers/approval' },
  { icon: 'building', text: '3 ToLet listings to review', color: '#3B82F6', path: '/tolet' },
]
