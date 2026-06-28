# Secure File Opener

A secure, full-stack TypeScript application for safely opening and managing files. Built with modern web technologies and a focus on security best practices.

**Live Demo:** [https://replit.com/@elizabeth232366/Secure-File-Opener](https://replit.com/@elizabeth232366/Secure-File-Opener)

## Overview

Secure File Opener is a monorepo project that provides a robust solution for file handling with security-first architecture. The project combines a backend API server with frontend clients, all written in TypeScript with comprehensive type safety.

### Key Features

- 🔒 **Security-First Design** — Supply-chain attack defenses, minimum release age requirements for dependencies
- 🏗️ **Full-Stack TypeScript** — Type-safe end-to-end development
- 📦 **Monorepo Architecture** — Organized workspace with shared libraries and multiple artifacts
- ⚡ **Modern Stack** — Express 5 API, PostgreSQL database with Drizzle ORM, React 19 frontend
- 🔄 **API Code Generation** — OpenAPI spec-driven development with Orval
- 📝 **Comprehensive Validation** — Zod schema validation and Drizzle-Zod integration

## Tech Stack

- **Runtime:** Node.js 24, pnpm workspaces
- **Language:** TypeScript 5.9
- **Backend:** Express 5, Pino logging
- **Database:** PostgreSQL + Drizzle ORM
- **Validation:** Zod (v4) + Drizzle-Zod
- **Frontend:** React 19, TailwindCSS 4
- **Build Tools:** Vite, esbuild
- **Code Generation:** Orval (OpenAPI)
- **Styling:** TailwindCSS, Framer Motion

## Repository Structure

```
├── artifacts/           # Built applications and packages
│   └── api-server/      # Express API server
├── lib/                 # Shared libraries and utilities
│   └── integrations/    # Third-party integrations (e.g., OpenAI)
├── scripts/             # Build and utility scripts
├── package.json         # Root workspace configuration
├── pnpm-workspace.yaml  # Workspace setup and dependency catalog
└── tsconfig.json        # TypeScript configuration
```

## Quick Start

### Prerequisites

- Node.js 24+
- pnpm (required; npm/yarn not allowed)
- PostgreSQL instance for `DATABASE_URL`

### Installation & Development

```bash
# Install dependencies
pnpm install

# Run the API server (port 5000)
pnpm --filter @workspace/api-server run dev

# Type-check the entire workspace
pnpm run typecheck

# Build all packages
pnpm run build

# Regenerate API hooks and Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push database schema changes (dev only)
pnpm --filter @workspace/db run push
```

### Environment Setup

Create a `.env` file (or export these variables):

```bash
DATABASE_URL=postgres://user:password@localhost:5432/secure_file_opener
NODE_ENV=development
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm run build` | Full typecheck and build of all packages |
| `pnpm run typecheck` | Type-check workspace and artifacts |
| `pnpm run typecheck:libs` | Type-check library packages only |
| `pnpm --filter @workspace/api-server run dev` | Start API server with hot reload |

## Security Practices

### Dependency Management

This project implements a **minimum release age requirement** of 1 day (1440 minutes) for all npm packages as a defense against supply-chain attacks. This allows time for the community to discover and report malicious releases before they're installed.

**Only exceptions:** Trusted packages from Replit (`@replit/*`) and `stripe-replit-sync` are pre-approved to bypass this check.

To install a package before the 1-day window:
1. Add it to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`
2. Only do this for packages from highly trusted organizations
3. Remove the exception once the 1-day window has passed

## Code Organization

### Package Structure

The project uses pnpm workspaces organized into:

- **`artifacts/*`** — Deployable applications and public packages
  - `api-server` — Express backend with OpenAI integration
- **`lib/*`** — Reusable libraries and shared code
  - `integrations/*` — Integration packages (e.g., OpenAI AI server)
- **`scripts`** — Build, deployment, and utility scripts

### Dependency Catalog

Common versions are centralized in `pnpm-workspace.yaml` under `catalog:` for consistency across the workspace. Use `catalog:` in package.json dependencies to reference them.

## Building & Deployment

The project uses **esbuild** for production builds with CommonJS output format. Each package defines its own build process in `package.json` scripts.

### Building the API Server

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

## API Development

The API uses **OpenAPI specifications** with **Orval** for code generation:

- OpenAPI spec defines contracts
- Orval generates TypeScript hooks and Zod schemas
- Drizzle-Zod ensures database schema consistency

Regenerate client code after spec changes:
```bash
pnpm --filter @workspace/api-spec run codegen
```

## Database

- **ORM:** Drizzle ORM
- **Database:** PostgreSQL
- **Migrations:** Drizzle Kit

Push schema changes during development:
```bash
pnpm --filter @workspace/db run push
```

## Logging

The API uses **Pino** for structured logging with HTTP middleware (`pino-http`) for request/response logging.

## Contributing

1. Ensure TypeScript types pass: `pnpm run typecheck`
2. Build before committing: `pnpm run build`
3. Follow the existing code organization patterns
4. Update `replit.md` and relevant documentation as you build

## License

MIT

## Support & Links

- **Live Project:** [https://replit.com/@elizabeth232366/Secure-File-Opener](https://replit.com/@elizabeth232366/Secure-File-Opener)
- **GitHub:** [oderojames/Secure-File-Opener](https://github.com/oderojames/Secure-File-Opener)
- **Language:** Primarily TypeScript (95.1%), with CSS (3.2%) and other assets (1.7%)

---

**Last Updated:** 2026-06-28

_For architecture decisions, advanced usage, and project-specific gotchas, see [replit.md](./replit.md)_
