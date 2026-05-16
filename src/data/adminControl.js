export const activityLogs = [
  { id: 'LOG-001', user_type: 'Admin', user_id: 'A001', action: 'Approve Worker', module: 'Workers', description: 'Approved worker W004 after document review', timestamp: '2026-04-09 09:20' },
  { id: 'LOG-002', user_type: 'Worker', user_id: 'W005', action: 'Accept Assistance', module: 'Assistance', description: 'Accepted village assistance request AST-301', timestamp: '2026-04-09 08:05' },
  { id: 'LOG-003', user_type: 'Customer', user_id: 'C002', action: 'Applied Coupon', module: 'Bookings', description: 'Applied ECO50 on booking BK-0121', timestamp: '2026-04-08 18:11' },
  { id: 'LOG-004', user_type: 'Admin', user_id: 'A001', action: 'Create Coupon', module: 'Coupons', description: 'Created WELCOME20 campaign coupon', timestamp: '2026-04-08 14:02' },
  { id: 'LOG-005', user_type: 'Admin', user_id: 'A002', action: 'Deactivate Area', module: 'Areas', description: 'Deactivated duplicate area record for MVP Colony', timestamp: '2026-04-07 11:43' },
]

export const settingsSections = [
  {
    key: 'General',
    items: [
      { id: 'platform_name', label: 'Platform Name', type: 'text', value: 'Ecohomely' },
      { id: 'support_phone', label: 'Support Phone', type: 'text', value: '+91 98765 43210' },
      { id: 'maintenance_mode', label: 'Maintenance Mode', type: 'toggle', value: false },
    ],
  },
  {
    key: 'Location',
    items: [
      { id: 'default_state', label: 'Default State', type: 'text', value: 'Andhra Pradesh' },
      { id: 'gps_required', label: 'Require GPS Onboarding', type: 'toggle', value: true },
      { id: 'cluster_radius', label: 'Default Cluster Radius (km)', type: 'number', value: 12 },
    ],
  },
  {
    key: 'Pricing',
    items: [
      { id: 'minimum_booking_fee', label: 'Minimum Booking Fee', type: 'number', value: 49 },
      { id: 'service_tax_enabled', label: 'Service Tax Enabled', type: 'toggle', value: true },
      { id: 'distance_charge_per_km', label: 'Distance Charge / km', type: 'number', value: 8 },
    ],
  },
  {
    key: 'Referral',
    items: [
      { id: 'referrer_reward', label: 'Referrer Reward', type: 'number', value: 50 },
      { id: 'new_user_reward', label: 'New User Reward', type: 'number', value: 50 },
      { id: 'referral_enabled', label: 'Referral Program Enabled', type: 'toggle', value: true },
    ],
  },
  {
    key: 'Cashback',
    items: [
      { id: 'cashback_enabled', label: 'Cashback Enabled', type: 'toggle', value: true },
      { id: 'cashback_validity_days', label: 'Cashback Validity (days)', type: 'number', value: 10 },
      { id: 'cashback_wallet_mode', label: 'Cashback App-Only', type: 'toggle', value: true },
    ],
  },
  {
    key: 'Coupons',
    items: [
      { id: 'coupon_stack_allowed', label: 'Allow Coupon Stacking', type: 'toggle', value: false },
      { id: 'coupon_enabled', label: 'Coupon Engine Enabled', type: 'toggle', value: true },
      { id: 'max_coupon_discount', label: 'Max Coupon Discount', type: 'number', value: 150 },
    ],
  },
  {
    key: 'Notifications',
    items: [
      { id: 'push_notifications', label: 'Push Notifications', type: 'toggle', value: true },
      { id: 'sms_notifications', label: 'SMS Notifications', type: 'toggle', value: true },
      { id: 'whatsapp_notifications', label: 'WhatsApp Notifications', type: 'toggle', value: false },
    ],
  },
  {
    key: 'Worker',
    items: [
      { id: 'max_professions', label: 'Max Professions Per Worker', type: 'number', value: 2 },
      { id: 'worker_auto_suspend', label: 'Auto Suspend Low Performers', type: 'toggle', value: false },
      { id: 'approval_required', label: 'Worker Approval Required', type: 'toggle', value: true },
    ],
  },
  {
    key: 'Booking',
    items: [
      { id: 'no_response_minutes', label: 'No Response Threshold (min)', type: 'number', value: 10 },
      { id: 'allow_cashback_on_booking', label: 'Allow Cashback on Bookings', type: 'toggle', value: true },
      { id: 'allow_coupon_or_cashback_only', label: 'Single Discount Rule', type: 'toggle', value: true },
    ],
  },
]
