export const agents = [
  { id: 1,  name: 'Agent 01', zone: 'Zone A', status: 'active',  lat: 28.6180, lng: 77.2100, lastSeen: '1 min ago'  },
  { id: 2,  name: 'Agent 02', zone: 'Zone B', status: 'active',  lat: 28.6120, lng: 77.2050, lastSeen: '2 min ago'  },
  { id: 3,  name: 'Agent 03', zone: 'Zone C', status: 'offline', lat: 28.6200, lng: 77.2200, lastSeen: '42 min ago' },
  { id: 4,  name: 'Agent 04', zone: 'Zone A', status: 'active',  lat: 28.6150, lng: 77.2080, lastSeen: 'just now'   },
  { id: 5,  name: 'Agent 05', zone: 'Zone D', status: 'alert',   lat: 28.6090, lng: 77.2150, lastSeen: '5 min ago'  },
  { id: 6,  name: 'Agent 06', zone: 'Zone B', status: 'active',  lat: 28.6130, lng: 77.2070, lastSeen: '3 min ago'  },
  { id: 7,  name: 'Agent 07', zone: 'Zone E', status: 'alert',   lat: 28.6170, lng: 77.2180, lastSeen: '8 min ago'  },
  { id: 8,  name: 'Agent 08', zone: 'Zone C', status: 'active',  lat: 28.6110, lng: 77.2120, lastSeen: '4 min ago'  },
  { id: 9,  name: 'Agent 09', zone: 'Zone A', status: 'offline', lat: 28.6190, lng: 77.2060, lastSeen: '1 hr ago'   },
  { id: 10, name: 'Agent 10', zone: 'Zone D', status: 'active',  lat: 28.6140, lng: 77.2140, lastSeen: '6 min ago'  },
]

export const agentStatusVariant = {
  active:  'success',
  offline: 'default',
  alert:   'danger',
}

export const stats = {
  total:   agents.length,
  active:  agents.filter(a => a.status === 'active').length,
  offline: agents.filter(a => a.status === 'offline').length,
  alert:   agents.filter(a => a.status === 'alert').length,
}
