# Revenact

Revenact is a customer-success intelligence platform frontend: a single-page application for CSM teams to monitor account health, manage organizations and contacts, automate playbooks, and query a company-wide knowledge base ("Company Brain").

## Features

- **Dashboards** — Health overview, ticket overview, and AI trending-topics views with interactive charts (donuts, trends, drill-down controls).
- **Organizations & Accounts** — List and Kanban board views, org detail pages with pinned attributes, lifecycle-stage metrics, and a modular activity feed (emails, notes, tickets, Slack threads, calendar events, CallSense call intelligence).
- **Copilot** — Chat interface with skill prompts, step-by-step Q&A flows, and chat history.
- **Scenario Builder** — Visual workflow editor built on node/edge graphs, with custom node panels, triggers, and an edit pane.
- **Company Brain** — Knowledge OS with a graph explorer, knowledge nodes, skills library, connectors, review queue, and feedback log, backed by Redux state.
- **Pipelines, Contacts, Integrations, Settings** — Supporting CRM surfaces with filtering, column management, and metrics panels.
- **Auth** — Login flow with token issuance, session persistence in localStorage, session refresh, and protected routing.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| State | Redux Toolkit (slices: `auth`, `tasks`, `brain`, `counter`) |
| Routing | React Router 7 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| Flow graphs | @xyflow/react |
| Tests | Vitest + React Testing Library (jsdom) |

## Getting started

```bash
npm ci
npm run dev
```

Sign in with one of the demo accounts:

- `demo@revenact.io` / `demo1234`
- `admin@revenact.io` / `password123`

## Scripts

```bash
npm run dev        # start the dev server
npm run build      # type-check and produce a production build
npm run lint       # run ESLint
npm test           # run the Vitest suite once
npm run test:watch # run tests in watch mode
```

## Project structure

```
src/
├── components/    # Reusable UI: auth, brain, contacts, dashboard, layout, organizations, shared
├── features/      # Redux Toolkit slices and their data/types (auth, tasks, brain, counter)
├── layouts/       # App shell (DashboardLayout with sidebar + global header)
├── pages/         # Route-level views (dashboard, organizations, copilot, scenarios, brain, ...)
├── store.ts       # Redux store configuration
├── hooks.ts       # Typed useAppSelector / useAppDispatch
└── test/          # Vitest setup
```

The app currently runs against in-memory fixture data (no backend required); auth, tasks, and Company Brain state flow through Redux.
