# Ecohomely Dashboard

A comprehensive admin dashboard for the Ecohomely platform built with React, Vite, and React Router.

## Project Structure

- **src/** - Main dashboard application with React components and screens
- **ecohomely-admin/** - Full-stack React Router application with TypeScript and Tailwind CSS
- **public/** - Static assets

## Tech Stack

- React 19.2.4
- Vite 8.0.4
- React Router DOM 7.14.0
- Leaflet & React Leaflet (mapping)
- Tailwind CSS (ecohomely-admin)
- TypeScript (ecohomely-admin)
- ESLint & Prettier (code quality)

## Getting Started

### Installation

```bash
npm install
cd ecohomely-admin && npm install && cd ..
```

### Development

**Main Dashboard:**
```bash
npm run dev
```

**Admin App (TypeScript):**
```bash
cd ecohomely-admin && npm run dev
```

### Building

```bash
npm run build
cd ecohomely-admin && npm run build
```

### Code Quality

```bash
npm run lint
```

## Features

- Dashboard with analytics and real-time metrics
- Servicemen (Workers) management
- Customer management & profiles
- Booking tracking & complaints
- Service categories & reviews
- Payment history & subscription plans
- GPS heatmap visualization
- City expansion tracking
- Push notifications system

## Environment Configuration

See `.env.example` for required environment variables.
