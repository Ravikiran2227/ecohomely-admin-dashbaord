# Ecohomely Dashboard — App Info

## Overview

Admin dashboard for the Ecohomely platform: analytics, workers, customers, bookings, payments, maps, and operational tools.

| Field | Value |
| --- | --- |
| **App name** | `dashbord` |
| **Version** | `0.0.0` |
| **Package type** | ES module (`"type": "module"`) |
| **Private** | Yes |

---

## Frontend Tech Stack

| Layer | Technology | Version |
| --- | --- | --- |
| UI library | React | ^19.2.4 |
| DOM rendering | React DOM | ^19.2.4 |
| Build tool | Vite | ^8.0.4 |
| Routing | React Router DOM | ^7.14.0 |
| Styling | Tailwind CSS | ^4.2.2 |
| CSS tooling | PostCSS, Autoprefixer | ^8.5.9 / ^10.4.27 |
| Icons | Lucide React | ^1.8.0 |
| Maps | Leaflet | ^1.9.4 |
| Maps (React) | React Leaflet | ^5.0.0 |
| Heatmaps | leaflet.heat | ^0.2.0 |
| Backend SDK (client) | Firebase | ^12.12.1 |

### Frontend tooling

| Tool | Version |
| --- | --- |
| ESLint | ^9.39.4 |
| Prettier | ^3.2.5 |
| `@vitejs/plugin-react` | ^6.0.1 |
| `@tailwindcss/postcss` | ^4.2.2 |

---

## Backend / Cloud Tech Stack

| Layer | Technology | Version / Notes |
| --- | --- | --- |
| Cloud platform | Firebase | Firestore, Auth, Storage, Functions |
| Functions runtime | Node.js | 22 |
| Functions package | `ecohomely-dashboard-functions` | `1.0.0` |
| Firebase Functions | `firebase-functions` | ^6.3.2 |
| Admin SDK | `firebase-admin` | ^12.7.0 |
| HTTP | Express | ^4.21.2 |
| CORS | `cors` | ^2.8.5 |
| Push notifications | Expo Server SDK | ^4.0.0 |
| Google APIs | `googleapis` | ^144.0.0 |
| Firestore location | `asia-south1` | `(default)` database |

---

## Hosting & Deployment

| Concern | Choice |
| --- | --- |
| Frontend hosting | Vercel (SPA rewrites via `vercel.json`) |
| Cloud backend | Firebase (Functions, Firestore, Storage) |

---

## Language & Project Style

- **Language:** JavaScript (JSX), not TypeScript for the main dashboard
- **Module system:** ESM
- **App entry:** Vite + React (`src/main.jsx`)

---

## npm Scripts (frontend)

| Script | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Preview build | `npm run preview` |
| Lint | `npm run lint` |
| Format | `npm run format` |
| Format check | `npm run format:check` |

---

## Feature Areas

- Dashboard analytics and real-time metrics
- Servicemen (workers) management and profiles
- Customer management and profiles
- Booking tracking and complaints
- Service categories and reviews
- Payments and subscription plans
- GPS heatmap visualization
- City / area expansion tracking
- Push notifications and announcements
- To-Let listings and related ops tools
- Admin RBAC and account management
