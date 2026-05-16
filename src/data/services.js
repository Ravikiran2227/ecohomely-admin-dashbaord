export const ECOHOMELY_SERVICE_GROUPS = [
  {
    category: 'Repair & Maintenance',
    services: [
      'AC Repair & Service',
      'Washing Machine Repair',
      'Refrigerator Repair',
      'TV Repair',
      'RO Water Purifier Service',
      'General Appliance Repair',
    ],
  },
  {
    category: 'Home Services',
    services: [
      'Home Cleaning',
      'Bathroom Cleaning',
      'Kitchen Cleaning',
      'Laundry Service',
      'Car Wash at Home',
      'Pest Control',
      'Water Can Delivery',
    ],
  },
  {
    category: 'Construction & Interior',
    services: [
      'Carpenter',
      'Electrician',
      'Plumber',
      'Painter',
      'Interior Designer',
      'Ceiling Work',
      'Putty Work',
    ],
  },
  {
    category: 'Beauty & Wellness',
    services: [
      'Beauty Services (Women)',
      'Men\'s Salon',
      'Mehndi Artist',
    ],
  },
  {
    category: 'Automobile & Drivers',
    services: [
      'Personal Driver',
      'Commercial Driver',
      '2-Wheeler Mechanic',
      '4-Wheeler Mechanic',
      'Multi-Vehicle Mechanic',
    ],
  },
  {
    category: 'Professional Services',
    services: [
      'Photography',
      'House Shifting / Movers',
      'Catering Services',
      'Smart Home Setup (CCTV, WiFi)',
    ],
  },
  {
    category: 'Tutoring Services',
    services: [
      'Academic Tutor',
      'Dance Tutor',
      'Music Tutor',
      'Yoga Trainer',
      'Sports Coach',
      'Combined Tutor (Multiple Skills)',
    ],
  },
]

export const ECOHOMELY_SERVICE_CATALOG = ECOHOMELY_SERVICE_GROUPS.flatMap((group) => group.services)
