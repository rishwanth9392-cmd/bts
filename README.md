# 🚌 BTS — College Bus Tracking System

Real-time bus tracking platform for college campuses. Students track buses live on a map, drivers broadcast their location, and administrators manage routes, schedules, and fleet health — all from a single monorepo.

---

## Architecture Overview

```
bts/
├── apps/
│   ├── web/            → Next.js 14 web dashboard (App Router)
│   └── api/            → Node.js REST + WebSocket API
├── packages/
│   ├── shared/         → Shared types, constants & utilities
│   ├── ui/             → Shared React component library
│   └── database/       → Prisma schema & client
├── docker-compose.yml  → Local PostgreSQL 15
├── turbo.json          → Turborepo pipeline config
├── tsconfig.json       → Root TypeScript config
├── .eslintrc.js        → Root ESLint config
├── .prettierrc         → Prettier formatting rules
├── .env.example        → Environment variable template
└── package.json        → Workspace root
```

### Apps

| App | Path | Description | Port |
|-----|------|-------------|------|
| **Web** | `apps/web` | Next.js dashboard — live map, route viewer, admin panel | `3000` |
| **API** | `apps/api` | REST API + WebSocket server for real-time location streaming | `4000` |

### Packages

| Package | Path | Description |
|---------|------|-------------|
| **@bts/shared** | `packages/shared` | TypeScript types, constants, and pure utility functions shared by web & API |
| **@bts/ui** | `packages/ui` | Reusable React components (buttons, cards, map overlays, etc.) |
| **@bts/database** | `packages/database` | Prisma schema, migrations, seed scripts, and a singleton client export |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | [Turborepo](https://turbo.build/repo) |
| Frontend | [Next.js 14](https://nextjs.org/) (App Router, React Server Components) |
| Backend | Node.js + Express / Fastify |
| Real-time | WebSockets (Socket.IO) |
| Database | PostgreSQL 15 |
| ORM | [Prisma](https://www.prisma.io/) |
| Auth | JWT (access + refresh tokens) |
| Maps | Leaflet / Mapbox GL JS |
| Styling | Tailwind CSS |
| Linting | ESLint + Prettier |
| Language | TypeScript 5 (strict mode) |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 10 (ships with Node 18+)
- **Docker** & **Docker Compose** (for the local PostgreSQL database)

### 1. Clone & install

```bash
git clone <repo-url> bts
cd bts
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your secrets (see .env.example for docs)
```

### 3. Start the database

```bash
docker compose up -d
```

### 4. Push the Prisma schema & generate the client

```bash
npm run db:push
npm run db:generate
```

### 5. Run all apps in dev mode

```bash
npm run dev
```

This launches **Turborepo** which starts the web app on `http://localhost:3000` and the API on `http://localhost:4000` simultaneously with hot-reload.

---

## Scripts

All scripts are run from the **repo root** via Turborepo:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in development mode |
| `npm run build` | Build all apps and packages |
| `npm run lint` | Lint the entire monorepo |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |
| `npm run clean` | Remove all build artifacts and `node_modules` |

---

## Project Conventions

- **Strict TypeScript** — `strict: true` everywhere; no `any` without justification.
- **Path aliases** — Import internal packages as `@bts/shared`, `@bts/ui`, `@bts/database`.
- **Consistent formatting** — Prettier runs on save and in CI.
- **Conventional Commits** — `feat:`, `fix:`, `chore:`, `docs:`, etc.
- **No hardcoded secrets** — All sensitive values live in `.env` (git-ignored).

---

## License

Private — All rights reserved.
